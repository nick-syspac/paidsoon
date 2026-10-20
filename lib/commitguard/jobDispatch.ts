import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { financialJobAccessSkip } from "@/lib/billing/financialJobAccess"
import { refreshCashPlanInTransaction } from "@/lib/cashplan/service"
import type { PrismaTx } from "@/lib/db/withUserContext"
import { claimCommitGuardJob, type CommitGuardJobRequest } from "@/lib/commitguard/jobClaim"
import { detectCommitmentCandidatesInTransaction } from "@/lib/commitguard/detection"
import { evaluateCommitGuardOperationalEvents } from "@/lib/commitguard/operationalEvaluation"
import { evaluateCommitGuardRiskEvents } from "@/lib/commitguard/riskEvaluation"
import { settleCommitGuardWork } from "@/lib/commitguard/workLifecycle"
import { withCommitGuardWorkSideEffects, CommitGuardWorkBoundaryError,
  type CommitGuardWorkEffects } from "@/lib/commitguard/workSideEffects"

export type CommitGuardJobResult = { status: "completed" } |
  { status: "skipped"; reason: string }

/** Trusted server composition only; never supplied by a request. Additional
 * effects run on the SAME transaction after the complete default D8 pipeline. */
export type CommitGuardJobEvaluator = (input: {
  tx: PrismaTx; effects: CommitGuardWorkEffects; userId: string; access: EffectiveAccess; now: Date
}) => Promise<void>

export async function dispatchCommitGuardJob(
  request: CommitGuardJobRequest,
  evaluator?: CommitGuardJobEvaluator,
): Promise<CommitGuardJobResult> {
  const claim = await claimCommitGuardJob(request)
  if (claim.status !== "claimed") return claim
  const identity = claim.identity
  try {
    const result = await withCommitGuardWorkSideEffects({ ...identity, complete: true }, async (tx, effects, access) => {
      // One database UTC clock for every financial calculation in this dispatch.
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
      if (identity.kind === "detect") {
        await detectCommitmentCandidatesInTransaction(tx, identity.userId, access, clock.now)
        return { status: "completed" as const }
      }
      if (financialJobAccessSkip(access, "commitguard_advanced_alerts") === null) {
        effects.requireAdvancedAlertsAccess()
      }
      await evaluateCommitGuardOperationalEvents({ tx, userId: identity.userId, access, now: clock.now })
      await evaluateCommitGuardRiskEvents({ tx, effects, userId: identity.userId, access, now: clock.now })
      // Same trusted tenant transaction and final access/revision/lease fence.
      // No separate scheduler, queued entitlement, or GET-triggered write.
      await refreshCashPlanInTransaction(tx, identity.userId, access, { now: clock.now })
      if (evaluator) {
        await evaluator({ tx, effects, userId: identity.userId, access, now: clock.now })
      }
      if (claim.daily) effects.saveEvaluationState({ lastSuccessfulDailyEvaluationAt: clock.now })
      return { status: "completed" as const }
    })
    return result
  } catch (error) {
    if (error instanceof CommitGuardWorkBoundaryError) {
      await settleCommitGuardWork(identity, error.reason === "superseded" ? "superseded" : "access_changed")
      return { status: "skipped", reason: error.reason }
    }
    await settleCommitGuardWork(identity, "execution_failed")
    throw error
  }
}