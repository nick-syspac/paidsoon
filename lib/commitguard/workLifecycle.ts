import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"
import type { CommitGuardWorkIdentity } from "@/lib/commitguard/workSideEffects"
import type { CommitGuardJobRequest } from "@/lib/commitguard/jobClaim"

export const COMMIT_GUARD_SCAN_LIMIT = 100
export const COMMIT_GUARD_MAX_ATTEMPTS = 6
export const COMMIT_GUARD_DEFER_SECONDS = 300

export function commitGuardRetrySeconds(attempts: number): number {
  return Math.min(3600, 60 * 2 ** Math.max(0, Math.min(6, attempts) - 1))
}

/** D7 system-only exception: orchestration metadata, never financial rows. All
 * lifecycle writers take the SAME tenant -> work lock order as financial work.
 * No tenant client, arbitrary SQL/role, payload error, or cached access accepted. */
export async function settleCommitGuardWork(
  identity: CommitGuardWorkIdentity,
  outcome: "deferred" | "execution_failed" | "superseded" | "access_changed",
): Promise<void> {
  await prismaAdmin.$transaction(async (tx) => {
    await lockCommitGuardTenant(tx, identity.userId)
    await tx.$queryRaw`SELECT id FROM public.commit_guard_work_items
      WHERE id = ${identity.workItemId} AND user_id = ${identity.userId} FOR UPDATE`
    const deferred = outcome === "deferred"
    const superseded = outcome === "superseded" && identity.kind === "evaluate"
    // Expired/wrong-fence workers may not release or reschedule a successor.
    // Explicit dependency deferral refunds this claim, never six-fails it.
    await tx.$executeRaw`
      UPDATE public.commit_guard_work_items
      SET state = CASE WHEN ${superseded} THEN 'skipped'
          WHEN NOT ${deferred} AND attempts >= 6 THEN 'failed' ELSE 'pending' END,
        attempts = CASE WHEN ${deferred} THEN greatest(0, attempts - 1) ELSE attempts END,
        next_attempt_at = (clock_timestamp() AT TIME ZONE 'UTC') +
          CASE WHEN ${deferred} THEN interval '300 seconds'
          ELSE least(3600, 60 * power(2, greatest(0, attempts - 1))) * interval '1 second' END,
        completed_at = CASE WHEN ${superseded} OR (NOT ${deferred} AND attempts >= 6)
          THEN (clock_timestamp() AT TIME ZONE 'UTC') ELSE NULL END,
        lease_owner = NULL, lease_expires_at = NULL,
        safe_error_code = ${deferred ? "evaluation_pipeline_pending" : outcome},
        updated_at = (clock_timestamp() AT TIME ZONE 'UTC')
      WHERE id = ${identity.workItemId} AND user_id = ${identity.userId} AND kind = ${identity.kind}
        AND state = 'processing' AND lease_owner = ${identity.leaseOwner} AND fence = ${identity.fence}
        AND lease_expires_at > (clock_timestamp() AT TIME ZONE 'UTC')
    `
  })
}

export async function recoverCommitGuardWork(request: CommitGuardJobRequest): Promise<void> {
  await prismaAdmin.$transaction(async (tx) => {
    await lockCommitGuardTenant(tx, request.userId)
    await tx.$queryRaw`SELECT id FROM public.commit_guard_work_items
      WHERE id = ${request.workItemId} AND user_id = ${request.userId} FOR UPDATE`
    // No fence increment is needed: clearing the owner/state invalidates it;
    // the next claim increments the monotonically increasing fence.
    await tx.$executeRaw`
      UPDATE public.commit_guard_work_items
      SET state = CASE WHEN attempts >= 6 THEN 'failed' ELSE 'pending' END,
        completed_at = CASE WHEN attempts >= 6 THEN (clock_timestamp() AT TIME ZONE 'UTC') ELSE NULL END,
        next_attempt_at = (clock_timestamp() AT TIME ZONE 'UTC') +
          least(3600, 60 * power(2, greatest(0, attempts - 1))) * interval '1 second',
        lease_owner = NULL, lease_expires_at = NULL, safe_error_code = 'lease_expired',
        updated_at = (clock_timestamp() AT TIME ZONE 'UTC')
      WHERE id = ${request.workItemId} AND user_id = ${request.userId} AND kind = ${request.kind}
        AND ((state = 'processing' AND lease_expires_at <= (clock_timestamp() AT TIME ZONE 'UTC'))
          OR (state = 'pending' AND attempts >= 6))
    `
  })
}

export const CommitGuardRetrySchema = z.object({
  userId: z.string().trim().min(1).max(200),
  workItemId: z.string().trim().min(1).max(200),
  expectedGeneration: z.number().int().min(0).max(2147483646),
}).strict()

/** Trusted manual action ONLY. The worker secret is not retry authorization.
 * Elevation is obtained here, not supplied by a caller or a queued payload. */
export async function retryCommitGuardWork(request: z.input<typeof CommitGuardRetrySchema>): Promise<boolean> {
  const { requireAdminElevation } = await import("@/lib/admin/guard")
  const actor = await requireAdminElevation({ minRole: "platform_admin" })
  const input = CommitGuardRetrySchema.parse(request)
  return prismaAdmin.$transaction(async (tx) => {
    await lockCommitGuardTenant(tx, input.userId)
    await tx.$queryRaw`SELECT id FROM public.commit_guard_work_items
      WHERE id = ${input.workItemId} AND user_id = ${input.userId} FOR UPDATE`
    // Preserve immutable source/dedupe/revision, monotonic fence, and all prior
    // generations. Compare-generation makes duplicate retry requests no-ops.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE public.commit_guard_work_items
      SET attempt_history = coalesce(attempt_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'generation', generation, 'attempts', attempts, 'reason', safe_error_code,
          'completedAt', completed_at, 'retriedAt', (clock_timestamp() AT TIME ZONE 'UTC'),
          'actorUserId', ${actor.userId}::text, 'adminSessionId', ${actor.adminSession.id}::text)),
        generation = generation + 1, attempts = 0, state = 'pending', completed_at = NULL,
        lease_owner = NULL, lease_expires_at = NULL, safe_error_code = NULL,
        next_attempt_at = (clock_timestamp() AT TIME ZONE 'UTC'), updated_at = (clock_timestamp() AT TIME ZONE 'UTC')
      WHERE id = ${input.workItemId} AND user_id = ${input.userId}
        AND state = 'failed' AND generation = ${input.expectedGeneration} AND fence < 2147483647
        AND EXISTS (SELECT 1 FROM public.platform_roles r JOIN public.admin_sessions s ON s.user_id = r.user_id
          WHERE r.user_id = ${actor.userId} AND r.status = 'active'
            AND r.role IN ('platform_admin', 'platform_owner') AND s.id = ${actor.adminSession.id}
            AND s.revoked_at IS NULL AND s.expires_at > (clock_timestamp() AT TIME ZONE 'UTC'))
      RETURNING id
    `
    return rows.length === 1
  })
}