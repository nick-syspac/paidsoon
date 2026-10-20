import { createHash } from "node:crypto"
import { z } from "zod"
import type { PrismaTx } from "@/lib/db/withUserContext"
import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { financialJobAccessSkip } from "@/lib/billing/financialJobAccess"
import { COMMIT_GUARD_EVENT_TYPES as EVENT } from "@/lib/commitguard/events"
import { loadCommitGuardSummaryInputInTransaction } from "@/lib/commitguard/service"
import { buildCommitGuardSummary } from "@/lib/commitguard/summary"
import type { CommitGuardWorkEffects } from "@/lib/commitguard/workSideEffects"

const RISK_TYPES = [EVENT.COMMITMENT_SHORTFALL, EVENT.COMMITMENT_BUFFER_LOW]
const AmountAudit = z.object({
  changedFields: z.object({ amountCents: z.object({ before: z.number().int().nonnegative(), after: z.number().int().nonnegative() }) }),
  currency: z.string().optional(), previousCurrency: z.string().optional(),
})
const LegacyAmount = z.object({ previousAmountCents: z.number(), currentAmountCents: z.number() })

/** Approved D8 OR threshold, including zero-baseline edits. Integer comparison
 * avoids rounding a 15% boundary. Amount decreases are informational. */
export function isMaterialCommitGuardAmountChange(before: number, after: number): boolean {
  const delta = Math.abs(after - before)
  return delta > 0 && (delta >= 5_000 || delta * 100 >= Math.max(before, 1) * 15)
}

/** D8 only: must run inside the existing D7 tenant/work/fence transaction.
 * No browser caller, independent transaction, mail or digest side effect. */
export async function evaluateCommitGuardRiskEvents(input: {
  tx: PrismaTx; effects: CommitGuardWorkEffects; userId: string; access: EffectiveAccess; now: Date
}): Promise<void> {
  const { tx, effects, userId, access, now } = input
  const facts = await loadCommitGuardSummaryInputInTransaction(tx, userId,
    financialJobAccessSkip(access, "tax_buffer_basic") === null, now)
  const summary = buildCommitGuardSummary(facts)
  const settings = facts.settings
  const advanced = settings.enabled && financialJobAccessSkip(access, "commitguard_advanced_alerts") === null
  const previous = await tx.commitGuardEvaluationState.findUnique({ where: { userId } })
  const history = await tx.commitmentEvent.findMany({ where: { userId, eventType: { in: [
    ...RISK_TYPES, EVENT.COMMITMENT_AMOUNT_CHANGED, EVENT.COMMITMENT_UPDATED,
  ] } }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] })
  const complete = summary.quality.state === "complete" && summary.freeCash.status !== null
  const status = complete ? summary.freeCash.status : null
  const safe = status === "safe"
  const publish = advanced && (status === "shortfall" ? settings.alertCommitmentShortfall
    : (status === "watch" || status === "at_risk") && settings.alertCommitmentBufferLow)
  let episode = previous?.cashRiskEpisodeId ?? null
  if (publish && (!episode || previous?.cashRiskRelevance === "resolved")) {
    // Deterministic after rollback/retry; the prior episode makes recurrence a
    // new identity even when cash cycles back to an earlier amount on one day.
    episode = `risk:${createHash("sha256").update(JSON.stringify([episode,
      summary.calculationRevision, summary.inputRevision, now.toISOString().slice(0, 10)])).digest("hex")}`
  }
  const current = [...history].reverse().find((event) => RISK_TYPES.includes(event.eventType as typeof RISK_TYPES[number]) &&
    event.cycleKey === episode && (event.relevance === "active" || event.relevance === "suspended"))
  const sameSeverity = previous?.cashRiskStatus === status && current !== undefined
  const key = publish ? sameSeverity ? current.dedupeKey! :
    `commitguard:${episode}:${status}:${current?.id ?? "entry"}:${summary.calculationRevision}:${summary.inputRevision}:${now.toISOString().slice(0, 10)}` : null

  for (const event of history.filter((event) => RISK_TYPES.includes(event.eventType as typeof RISK_TYPES[number]))) {
    if (event.relevance !== "active" && event.relevance !== "suspended") continue
    if (publish && event.dedupeKey === key) continue
    const relevance = safe ? "resolved" : publish ? "superseded" : "suspended"
    if (event.relevance === relevance) continue
    await tx.commitmentEvent.updateMany({ where: { userId, id: event.id },
      data: { relevance, resolvedAt: relevance === "suspended" ? null : now } })
  }
  if (publish && key) {
    effects.requireAdvancedAlertsAccess()
    const eventType = status === "shortfall" ? EVENT.COMMITMENT_SHORTFALL : EVENT.COMMITMENT_BUFFER_LOW
    const data = { eventType, cycleKey: episode, inputRevision: summary.calculationRevision,
      relevance: "active", resolvedAt: null,
      severity: status === "shortfall" ? "critical" : status === "at_risk" ? "warning" : "watch",
      title: status === "shortfall" ? "Commitment shortfall detected" : "Commitment safety buffer low",
      message: status === "shortfall" ? "Projected free cash is below zero." : "Projected free cash is within the safety buffer.",
      metadata: { episodeId: episode, status, cashInputRevision: summary.inputRevision,
        currency: summary.currency, horizonDays: summary.selectedHorizonDays,
        freeCashCents: summary.freeCash.freeCashCents, protectedCashCents: summary.freeCash.protectedCashCents,
        safetyBufferCents: summary.freeCash.safetyBufferCents,
        projectedDeficitCents: Math.max(0, -(summary.freeCash.freeCashCents ?? 0)),
        balanceAsOf: summary.sourceDates.balanceAsOf } }
    await tx.commitmentEvent.upsert({ where: { userId_dedupeKey: { userId, dedupeKey: key } },
      create: { ...data, userId, dedupeKey: key, occurredAt: now }, update: data })
  }

  // Basic mutation audit is permanent, independent of advanced publication.
  // A skipped preference/access interval advances evaluation state, so restoring
  // access does not replay those changes as fresh notifications.
  for (const event of history.filter((event) => event.eventType === EVENT.COMMITMENT_AMOUNT_CHANGED)) {
    if (advanced && settings.alertCommitmentAmountChanged || event.relevance !== "active") continue
    await tx.commitmentEvent.updateMany({ where: { userId, id: event.id }, data: { relevance: "suspended", resolvedAt: null } })
  }
  if (advanced && settings.alertCommitmentAmountChanged) {
    for (const audit of history.filter((event) => event.eventType === EVENT.COMMITMENT_UPDATED && event.commitmentId)) {
      if (audit.inputRevision !== null ? audit.inputRevision > summary.calculationRevision ||
        audit.inputRevision <= (previous?.calculationRevision ?? -1)
        : previous?.lastEvaluatedAt && audit.occurredAt <= previous.lastEvaluatedAt) continue
      const parsed = AmountAudit.safeParse(audit.metadata)
      if (!parsed.success) continue
      const { before, after } = parsed.data.changedFields.amountCents
      if (!isMaterialCommitGuardAmountChange(before, after)) continue
      // Different currencies cannot be compared as a monetary delta.
      if (parsed.data.previousCurrency && parsed.data.currency && parsed.data.previousCurrency !== parsed.data.currency) continue
      const key = `commitguard:amount-changed:${audit.commitmentId}:audit:${audit.id}`
      // Retain pre-D8 published history; never generate a second notification
      // for its corresponding changed-field audit during the upgrade.
      if (history.some((event) => {
        if (event.eventType !== EVENT.COMMITMENT_AMOUNT_CHANGED || event.commitmentId !== audit.commitmentId) return false
        if (event.dedupeKey === key) return true
        const old = LegacyAmount.safeParse(event.metadata)
        return event.inputRevision === null && old.success && old.data.previousAmountCents === before &&
          old.data.currentAmountCents === after && event.occurredAt.getTime() >= audit.occurredAt.getTime() &&
          event.occurredAt.toISOString().slice(0, 10) === audit.occurredAt.toISOString().slice(0, 10)
      })) continue
      effects.requireAdvancedAlertsAccess()
      const delta = Math.abs(after - before)
      const data = { commitmentId: audit.commitmentId, eventType: EVENT.COMMITMENT_AMOUNT_CHANGED,
        cycleKey: `amount:${audit.id}`, inputRevision: audit.inputRevision ?? summary.calculationRevision,
        relevance: "historical", severity: after < before ? "info" : delta * 100 >= Math.max(before, 1) * 35 ? "warning" : "watch",
        title: "Commitment amount changed", message: after < before ? "Commitment amount decreased." : "Commitment amount increased.",
        occurredAt: audit.occurredAt,
        metadata: { auditEventId: audit.id, previousAmountCents: before, currentAmountCents: after,
          amountDeltaCents: delta, direction: after < before ? "decrease" : "increase",
          currency: parsed.data.currency ?? null } }
      await tx.commitmentEvent.upsert({ where: { userId_dedupeKey: { userId, dedupeKey: key } },
        create: { ...data, userId, dedupeKey: key }, update: {} })
    }
  }
  const remainsResolved = !publish && previous?.cashRiskRelevance === "resolved"
  effects.saveEvaluationState({ lastEvaluatedAt: now, calculationRevision: summary.calculationRevision,
    cashInputRevision: summary.inputRevision, cashRiskEpisodeId: episode,
    cashRiskStatus: safe ? "safe" : publish ? status : previous?.cashRiskStatus as "safe" | "watch" | "at_risk" | "shortfall" | null ?? null,
    cashRiskRelevance: safe || remainsResolved ? "resolved" : publish ? "active" : episode ? "suspended" : null,
    cashRiskResolvedAt: safe ? previous?.cashRiskRelevance === "resolved" ? previous.cashRiskResolvedAt : now
      : remainsResolved ? previous.cashRiskResolvedAt : null })
}