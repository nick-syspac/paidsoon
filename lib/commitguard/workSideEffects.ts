import { z } from "zod"
import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"
import { resolveEffectiveAccess, type EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { financialJobAccessSkip } from "@/lib/billing/financialJobAccess"
import { EFFECTIVE_ACCESS_PROFILE_SELECT, EFFECTIVE_ACCESS_GRANT_SELECT,
  EFFECTIVE_ACCESS_RISK_SELECT } from "@/lib/billing/effectiveAccessSnapshot"

export const COMMIT_GUARD_LEASE_MS = 60_000

const IdentitySchema = z.object({
  userId: z.string().min(1),
  workItemId: z.string().min(1),
  kind: z.enum(["detect", "evaluate"]),
  leaseOwner: z.string().min(1),
  fence: z.number().int().nonnegative().max(2147483647),
  expectedCalculationRevision: z.number().int().nonnegative().max(2147483647),
  complete: z.boolean().optional(),
}).strict()

export type CommitGuardWorkIdentity = z.input<typeof IdentitySchema>
export type CommitGuardWorkBoundaryReason = "work_unavailable" | "lease_lost" | "superseded" |
  "no_access" | "feature_not_available" | "module_disabled" | "detection_disabled" | "boundary_closed"

export class CommitGuardWorkBoundaryError extends Error {
  constructor(readonly reason: CommitGuardWorkBoundaryReason) {
    super(`CommitGuard work boundary: ${reason}`)
    this.name = "CommitGuardWorkBoundaryError"
  }
}

const EvaluationPatchSchema = z.object({
  lastEvaluatedAt: z.date().nullable().optional(),
  lastSuccessfulDailyEvaluationAt: z.date().nullable().optional(),
  calculationRevision: z.number().int().nonnegative().nullable().optional(),
  cashInputRevision: z.number().int().nonnegative().nullable().optional(),
  cashRiskEpisodeId: z.string().nullable().optional(),
  cashRiskStatus: z.enum(["safe", "watch", "at_risk", "shortfall"]).nullable().optional(),
  cashRiskRelevance: z.enum(["active", "suspended", "resolved"]).nullable().optional(),
  cashRiskResolvedAt: z.date().nullable().optional(),
}).strict()

export interface CommitGuardWorkEffects {
  /** Stage protected state; it is written only AFTER the financial callback ends. */
  saveEvaluationState(patch: z.input<typeof EvaluationPatchSchema>): void
  /** Revalidate advanced publication access at the final transaction boundary. */
  requireAdvancedAlertsAccess(): void
}

/**
 * Internal system-job boundary, not a route admission/claim API. The caller must
 * already own a persisted processing lease; queued tiers/permissions are rejected.
 * Every invocation is ONE side-effect transaction, not a guard to run before a
 * separate transaction. Do not perform external effects or return lazy DB work.
 *
 * D11 exception: only fixed work/state operations and the private platform-role
 * fact use the connection's executor role. Tenant financial operations always run
 * inside withUserContext, under authenticated RLS. No arbitrary privileged
 * callback, role identifier, SQL fragment, or global admin client is exposed.
 */
export async function withCommitGuardWorkSideEffects<T>(
  identity: CommitGuardWorkIdentity,
  effect: (tx: PrismaTx, effects: CommitGuardWorkEffects, access: EffectiveAccess) => Promise<T>,
): Promise<T> {
  // Copy/validate before any awaits so callers cannot change the fence mid-run.
  const input = IdentitySchema.parse(identity)
  return withUserContext(input.userId, async (tx) => {
    let open = true
    let boundaryFailure: unknown
    let evaluationPatch: z.output<typeof EvaluationPatchSchema> | undefined
    let advancedAlertsRequired = false
    const fail = (reason: CommitGuardWorkBoundaryReason): never => {
      throw new CommitGuardWorkBoundaryError(reason)
    }
    // These private closures are never passed to financial callbacks. Static
    // SET LOCAL ROLE NONE restores the session executor (not a caller's role).
    async function readWorkAndLock(): Promise<void> {
      try {
        await tx.$executeRaw`SET LOCAL ROLE NONE`
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM public.commit_guard_work_items
          WHERE id = ${input.workItemId} AND user_id = ${input.userId} AND kind = ${input.kind}
          FOR UPDATE
        `
        if (rows.length !== 1) fail("work_unavailable")
      } finally {
        await tx.$executeRaw`SET LOCAL ROLE authenticated`
      }
    }
    async function assertFence(complete = false): Promise<void> {
      try {
        await tx.$executeRaw`SET LOCAL ROLE NONE`
        // clock_timestamp(), NOT now()/CURRENT_TIMESTAMP (transaction start).
        // The final conditional assertion occurs AFTER callbacks/state writes:
        // zero rows throws and rolls back ALL prior financial/protected effects.
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE public.commit_guard_work_items w
          SET updated_at = (clock_timestamp() AT TIME ZONE 'UTC'),
            state = CASE WHEN ${complete} THEN 'completed' ELSE w.state END,
            completed_at = CASE WHEN ${complete} THEN (clock_timestamp() AT TIME ZONE 'UTC') ELSE w.completed_at END,
            lease_owner = CASE WHEN ${complete} THEN NULL ELSE w.lease_owner END,
            lease_expires_at = CASE WHEN ${complete} THEN NULL
              ELSE (clock_timestamp() AT TIME ZONE 'UTC') + interval '60 seconds' END
          WHERE w.id = ${input.workItemId} AND w.user_id = ${input.userId} AND w.kind = ${input.kind}
            AND w.state = 'processing' AND w.lease_owner = ${input.leaseOwner} AND w.fence = ${input.fence}
            AND w.lease_expires_at > (clock_timestamp() AT TIME ZONE 'UTC')
            AND w.lease_expires_at <= (clock_timestamp() AT TIME ZONE 'UTC') + interval '60 seconds'
            AND (w.kind = 'detect' OR w.calculation_revision = ${input.expectedCalculationRevision})
            AND EXISTS (SELECT 1 FROM public.commit_guard_settings s WHERE s.user_id = w.user_id
              AND s.calculation_revision = ${input.expectedCalculationRevision} AND s.enabled
              AND (w.kind <> 'detect' OR s.detect_recurring_commitments))
          RETURNING w.id
        `
        if (rows.length !== 1) fail("lease_lost")
      } finally {
        await tx.$executeRaw`SET LOCAL ROLE authenticated`
      }
    }
    async function assertCurrentAccess(): Promise<EffectiveAccess> {
      let platformOwnerAccess = false
      try {
        await tx.$executeRaw`SET LOCAL ROLE NONE`
        // The central resolver's platform-owner fallback needs a private role
        // fact. Read it on THIS transaction, never a separate admin connection.
        const role = await tx.platformRole.findUnique({ where: { userId: input.userId },
          select: { role: true, status: true } })
        platformOwnerAccess = role?.role === "platform_owner" && role.status === "active"
      } finally {
        await tx.$executeRaw`SET LOCAL ROLE authenticated`
      }
      const profile = await tx.userProfile.findUnique({ where: { userId: input.userId }, select: EFFECTIVE_ACCESS_PROFILE_SELECT })
      const grant = await tx.tenantTrialGrant.findUnique({ where: { userId: input.userId }, select: EFFECTIVE_ACCESS_GRANT_SELECT })
      const billingRisks = await tx.tenantBillingRisk.findMany({ where: { userId: input.userId }, select: EFFECTIVE_ACCESS_RISK_SELECT })
      const settings = await tx.commitGuardSetting.findUnique({ where: { userId: input.userId },
        select: { enabled: true, detectRecurringCommitments: true, calculationRevision: true } })
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
      const access = resolveEffectiveAccess({ profile, grant, billingRisks, platformOwnerAccess }, clock.now)
      const skip = financialJobAccessSkip(access, "commitguard_core") ??
        (input.kind === "detect" ? financialJobAccessSkip(access, "commitguard_detection") : null) ??
        (advancedAlertsRequired ? financialJobAccessSkip(access, "commitguard_advanced_alerts") : null)
      if (skip) fail(skip.reason)
      if (!settings?.enabled) fail("module_disabled")
      if (input.kind === "detect" && !settings?.detectRecurringCommitments) fail("detection_disabled")
      if (settings?.calculationRevision !== input.expectedCalculationRevision) fail("superseded")
      return access
    }
    try {
      // No financial row lock can precede these two locks. Existing D5/D4
      // services share the exact same tenant advisory key.
      await lockCommitGuardTenant(tx, input.userId)
      await readWorkAndLock()
      const access = await assertCurrentAccess()
      await assertFence()
      const result = await effect(tx, {
        requireAdvancedAlertsAccess: () => {
          try {
            if (!open) fail("boundary_closed")
            if (input.kind !== "evaluate") fail("work_unavailable")
            advancedAlertsRequired = true
          } catch (error) {
            boundaryFailure = error
            throw error
          }
        },
        saveEvaluationState: (patch) => {
          try {
            if (!open) fail("boundary_closed")
            if (input.kind !== "evaluate") fail("work_unavailable")
            const data = EvaluationPatchSchema.parse(patch)
            if (data.calculationRevision !== undefined && data.calculationRevision !== input.expectedCalculationRevision) fail("superseded")
            // Never elevate while caller code is executing, even if it uses
            // Promise.all. Merge validated data, not SQL or caller callbacks.
            evaluationPatch = { ...evaluationPatch, ...data }
          } catch (error) {
            // Even if a callback catches a rejected protected operation, it
            // cannot commit the rest of this transaction.
            boundaryFailure = error
            throw error
          }
        },
      }, access)
      open = false
      if (boundaryFailure) throw boundaryFailure
      await assertCurrentAccess()
      if (evaluationPatch) {
        try {
          await tx.$executeRaw`SET LOCAL ROLE NONE`
          await tx.commitGuardEvaluationState.upsert({ where: { userId: input.userId },
            create: { ...evaluationPatch, userId: input.userId }, update: evaluationPatch })
        } finally {
          await tx.$executeRaw`SET LOCAL ROLE authenticated`
        }
        await assertCurrentAccess()
      }
      await assertFence(input.complete)
      return result
    } finally {
      open = false
      // On SQL failure PostgreSQL may refuse this statement; that is fatal,
      // never swallowed. Transaction rollback restores the pooled role/GUCs.
      await tx.$executeRaw`SET LOCAL ROLE authenticated`
    }
  })
}