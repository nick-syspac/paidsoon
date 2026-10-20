import { randomUUID } from "node:crypto"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { getFinancialJobAccessSkip } from "@/lib/billing/financialJobAccess"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"
import { commitGuardDetectionDedupeKey } from "@/lib/commitguard/detectionRequest"
import type { CommitGuardWorkIdentity } from "@/lib/commitguard/workSideEffects"

export const CommitGuardJobSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  workItemId: z.string().trim().min(1).max(200),
  kind: z.enum(["detect", "evaluate"]),
}).strict()
export type CommitGuardJobRequest = z.infer<typeof CommitGuardJobSchema>

type ClaimResult = { status: "claimed"; identity: CommitGuardWorkIdentity; daily: boolean } |
  { status: "skipped"; reason: "work_unavailable" | "invalid_source" | "superseded" |
    "no_access" | "feature_not_available" | "module_disabled" | "detection_disabled" }

/** Internal-job-only D7 exception: system transaction reads/claims work and
 * successful-source METADATA only. Never read amounts, suppliers or recipients.
 * All financial execution belongs to withCommitGuardWorkSideEffects under RLS.
 * Lifecycle/recovery lives in workLifecycle; queued identity is never access. */
export async function claimCommitGuardJob(request: CommitGuardJobRequest): Promise<ClaimResult> {
  const input = CommitGuardJobSchema.parse(request)
  return prismaAdmin.$transaction(async (tx) => {
    await lockCommitGuardTenant(tx, input.userId)
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.commit_guard_work_items
      WHERE id = ${input.workItemId} AND user_id = ${input.userId} AND kind = ${input.kind}
      FOR UPDATE
    `
    if (locked.length !== 1) return { status: "skipped", reason: "work_unavailable" }
    const work = await tx.commitGuardWorkItem.findFirst({
      where: { id: input.workItemId, userId: input.userId, kind: input.kind },
      select: { sourceKind: true, sourceId: true, dedupeKey: true, calculationRevision: true },
    })
    if (!work) return { status: "skipped", reason: "work_unavailable" }
    const skipWork = async (reason: "invalid_source" | "superseded" | "no_access" |
      "feature_not_available" | "module_disabled" | "detection_disabled"): Promise<ClaimResult> => {
      const terminal = reason === "invalid_source" || reason === "superseded"
      await tx.$executeRaw`
        UPDATE public.commit_guard_work_items
        SET state = CASE WHEN ${terminal} THEN 'skipped' ELSE state END,
          completed_at = CASE WHEN ${terminal} THEN (clock_timestamp() AT TIME ZONE 'UTC') ELSE NULL END,
          next_attempt_at = (clock_timestamp() AT TIME ZONE 'UTC') + interval '300 seconds',
          safe_error_code = ${reason}, updated_at = (clock_timestamp() AT TIME ZONE 'UTC')
        WHERE id = ${input.workItemId} AND user_id = ${input.userId} AND kind = ${input.kind} AND state = 'pending'
      `
      return { status: "skipped", reason }
    }
    const skip = await getFinancialJobAccessSkip(input.userId, "commitguard_core") ??
      (input.kind === "detect" ? await getFinancialJobAccessSkip(input.userId, "commitguard_detection") : null)
    if (skip) return skipWork(skip.reason)
    if (input.kind === "detect") {
      if (!work.sourceId || (work.sourceKind !== "accounting_sync_run" && work.sourceKind !== "spend_import_batch") ||
        work.dedupeKey !== commitGuardDetectionDedupeKey({ sourceKind: work.sourceKind, sourceId: work.sourceId })) {
        return skipWork("invalid_source")
      }
      const source = work.sourceKind === "accounting_sync_run"
        ? await tx.accountingSyncRun.findFirst({ where: { id: work.sourceId, userId: input.userId,
          status: "success", completedAt: { not: null }, invoicesSkipped: 0 }, select: { id: true } })
        : await tx.spendImportBatch.findFirst({ where: { id: work.sourceId, userId: input.userId,
          status: "completed", completedAt: { not: null }, rowsFailed: 0, rowsSkipped: 0 }, select: { id: true } })
      if (!source) return skipWork("invalid_source")
    } else {
      const mutation = work.sourceKind === "mutation" && work.sourceId === null &&
        work.dedupeKey === `evaluation:${work.calculationRevision}`
      const daily = work.sourceKind === "daily" && work.sourceId !== null &&
        /^\d{4}-\d{2}-\d{2}$/.test(work.sourceId) &&
        Number.isFinite(Date.parse(`${work.sourceId}T00:00:00Z`)) &&
        new Date(`${work.sourceId}T00:00:00Z`).toISOString().slice(0, 10) === work.sourceId &&
        work.dedupeKey === `daily:${work.sourceId}`
      if (!mutation && !daily) return skipWork("invalid_source")
    }
    const settings = await tx.commitGuardSetting.findUnique({ where: { userId: input.userId },
      select: { calculationRevision: true, enabled: true, detectRecurringCommitments: true } })
    if (!settings?.enabled) return skipWork("module_disabled")
    if (input.kind === "detect" && !settings.detectRecurringCommitments) return skipWork("detection_disabled")
    if (input.kind === "evaluate" && work.calculationRevision !== settings.calculationRevision) {
      return skipWork("superseded")
    }
    const leaseOwner = randomUUID()
    const [claim] = await tx.$queryRaw<Array<{ fence: number }>>`
      UPDATE public.commit_guard_work_items
      SET state = 'processing', attempts = attempts + 1, fence = fence + 1,
        lease_owner = ${leaseOwner},
        lease_expires_at = (clock_timestamp() AT TIME ZONE 'UTC') + interval '60 seconds',
        updated_at = (clock_timestamp() AT TIME ZONE 'UTC'), safe_error_code = NULL
      WHERE id = ${input.workItemId} AND user_id = ${input.userId} AND kind = ${input.kind}
        AND state = 'pending' AND next_attempt_at <= (clock_timestamp() AT TIME ZONE 'UTC')
        AND attempts < 6 AND fence < 2147483647
      RETURNING fence
    `
    if (!claim) return { status: "skipped", reason: "work_unavailable" }
    return { status: "claimed", daily: work.sourceKind === "daily", identity: { ...input, leaseOwner, fence: claim.fence,
      expectedCalculationRevision: settings.calculationRevision } }
  })
}