import { requireFeature } from "@/lib/billing"
import { withUserContext } from "@/lib/db/withUserContext"
import { COMMIT_GUARD_EVENT_TYPES as E } from "@/lib/commitguard/events"
import { buildCommitGuardOperationalEvents } from "@/lib/commitguard/operationalEvaluation"
import { formatCommitGuardMoney } from "@/lib/commitguard/summaryPresentation"
import type { CommitGuardSummary } from "@/lib/commitguard/summary"
import type { OwnersDigestSignal } from "@/lib/ownersDigest/types"

const TITLES: Record<string, string> = {
  [E.COMMITMENT_DUE_SOON]: "Commitment due soon",
  [E.COMMITMENT_RENEWAL_APPROACHING]: "Commitment renewal approaching",
  [E.COMMITMENT_NOTICE_PERIOD_APPROACHING]: "Commitment notice period approaching",
  [E.COMMITMENT_AMOUNT_CHANGED]: "Commitment amount changed",
  [E.COMMITMENT_DETECTED]: "Recurring commitment ready for review",
  [E.COMMITMENT_SHORTFALL]: "Commitment cash shortfall",
  [E.COMMITMENT_BUFFER_LOW]: "Commitment safety buffer low",
}
const RISK = new Set<string>([E.COMMITMENT_SHORTFALL, E.COMMITMENT_BUFFER_LOW])
const INFORMATIONAL = [E.COMMITMENT_AMOUNT_CHANGED, E.COMMITMENT_DETECTED]
const ACTIVE_STATUSES = new Set(["active", "upcoming", "ending", "review"])
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function cents(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 2_147_483_647 ? value : null
}
function currency(value: unknown): string | null {
  return typeof value === "string" && /^[a-z]{3}$/i.test(value) ? value.toLowerCase() : null
}
function textDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null
}
// Other existing cash-pressure providers rank AUD cents. Never compare another
// currency with their amounts, or invent FX by attaching their correlation key.
function pressureKey(code: string): string { return code === "aud" ? "cash_pressure" : `cash_pressure:${code}` }

/** Read-only D8 adapter. The digest owns materiality, cadence, opt-in and mail
 * entitlement; this adapter creates neither delivery nor subscription records.
 * Bounds come from the digest's existing UTC bucket, NOT the stored timezone. */
export async function loadCommitGuardDigestSignals(input: {
  userId: string; now: Date; summary: CommitGuardSummary; periodStart: Date; periodEnd: Date
}): Promise<OwnersDigestSignal[]> {
  const { userId, now, summary, periodStart, periodEnd } = input
  if (!summary.enabled || !await requireFeature(userId, "commitguard_core")) return []
  const [advanced, detection] = await Promise.all([
    requireFeature(userId, "commitguard_advanced_alerts"), requireFeature(userId, "commitguard_detection"),
  ])
  if (!advanced) return []
  return withUserContext(userId, async (tx) => {
    const [settings, state, rows] = await Promise.all([
      tx.commitGuardSetting.findUnique({ where: { userId } }),
      tx.commitGuardEvaluationState.findUnique({ where: { userId } }),
      tx.commitmentEvent.findMany({ where: { userId, eventType: { in: Object.keys(TITLES) },
        occurredAt: { lte: now }, OR: [
          { relevance: "active", resolvedAt: null },
          { eventType: { in: INFORMATIONAL }, relevance: "historical", resolvedAt: null,
            occurredAt: { gte: periodStart, lte: periodEnd < now ? periodEnd : now } },
        ] }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { id: true, eventType: true, severity: true, occurredAt: true, resolvedAt: true,
          relevance: true, metadata: true, commitmentId: true, detectionCandidateId: true,
          dedupeKey: true, cycleKey: true, inputRevision: true } }),
    ])
    // A concurrent mutation between the summary and event read must not combine
    // old cash with new preferences/schedules. Next generation can retry safely.
    if (!settings?.enabled || settings.calculationRevision !== summary.calculationRevision) return []
    const [commitments, candidates] = await Promise.all([
      tx.commitment.findMany({ where: { userId, id: { in: rows.flatMap((r) => r.commitmentId ? [r.commitmentId] : []) } } }),
      tx.commitmentDetectionCandidate.findMany({ where: { userId,
        id: { in: rows.flatMap((r) => r.detectionCandidateId ? [r.detectionCandidateId] : []) } },
        select: { id: true, name: true, status: true, currency: true, typicalAmountCents: true, evidenceFingerprint: true } }),
    ])
    const current = new Map(buildCommitGuardOperationalEvents({ commitments, settings,
      history: rows, advancedAlerts: advanced, now }).filter((event) => event.relevance === "active")
      .map((event) => [event.dedupeKey, event]))
    const signals: OwnersDigestSignal[] = []
    const seen = new Set<string>()
    for (const row of rows) {
      if (row.resolvedAt || row.occurredAt > now || !TITLES[row.eventType]) continue
      const informational = INFORMATIONAL.includes(row.eventType as typeof INFORMATIONAL[number])
      if (row.relevance !== "active" && !(informational && row.relevance === "historical")) continue
      if (informational && (row.occurredAt < periodStart || row.occurredAt > periodEnd)) continue
      const data = object(row.metadata)
      const commitment = commitments.find((c) => c.id === row.commitmentId)
      const candidate = candidates.find((c) => c.id === row.detectionCandidateId)
      const isRisk = RISK.has(row.eventType)
      const operational = current.get(row.dedupeKey ?? "")
      let code = currency(data.currency)
      let impact: number | null = null
      let description = TITLES[row.eventType]
      let correlationKey = `commitguard:event:${row.id}`
      if (isRisk) {
        const status = summary.freeCash.status
        if (summary.quality.state !== "complete" || !summary.currency ||
          state?.cashRiskRelevance !== "active" || row.cycleKey !== state.cashRiskEpisodeId ||
          state.cashRiskStatus !== status || data.status !== status ||
          state.lastEvaluatedAt?.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10) ||
          state.calculationRevision !== summary.calculationRevision || state.cashInputRevision !== summary.inputRevision ||
          row.inputRevision !== summary.calculationRevision || data.cashInputRevision !== summary.inputRevision ||
          data.horizonDays !== summary.selectedHorizonDays || code !== summary.currency ||
          (row.eventType === E.COMMITMENT_SHORTFALL ? status !== "shortfall" || !settings.alertCommitmentShortfall
            : !["watch", "at_risk"].includes(status ?? "") || !settings.alertCommitmentBufferLow)) continue
        impact = status === "shortfall" ? Math.max(0, -(summary.freeCash.freeCashCents ?? 0))
          : Math.max(0, (summary.freeCash.safetyBufferCents ?? 0) - (summary.freeCash.freeCashCents ?? 0))
        description = `Free cash is ${formatCommitGuardMoney(summary.freeCash.freeCashCents, code)} over the selected ${summary.selectedHorizonDays}-day horizon.`
        correlationKey = pressureKey(code!)
      } else if (row.eventType === E.COMMITMENT_DETECTED) {
        if (!detection || !settings.detectRecurringCommitments || candidate?.status !== "pending" ||
          !row.dedupeKey || row.dedupeKey !== `commitguard:detected:${candidate.id}:${candidate.evidenceFingerprint ?? "none"}`) continue
        code = currency(candidate.currency); impact = cents(candidate.typicalAmountCents)
        description = `${candidate.name} looks recurring and is ready for review.`
      } else {
        if (!commitment || commitment.archivedAt || !ACTIVE_STATUSES.has(commitment.status)) continue
        if (row.eventType === E.COMMITMENT_AMOUNT_CHANGED) {
          if (!settings.alertCommitmentAmountChanged) continue
          impact = cents(data.amountDeltaCents)
          description = `${commitment.name}: amount ${data.direction === "decrease" ? "decreased (informational)" : "changed"}.`
        } else {
          if (!operational || operational.cycleKey !== row.cycleKey) continue
          // Use current schedule relevance but retain original event dates/ID.
          code = currency(operational.metadata.currency)
          impact = row.eventType === E.COMMITMENT_DUE_SOON ? cents(operational.metadata.amountCents) : cents(commitment.amountCents)
          description = `${commitment.name} · ${row.eventType === E.COMMITMENT_DUE_SOON
            ? `Due ${textDate(operational.metadata.occurrenceDate)} (UTC)`
            : `Notice closes ${textDate(operational.metadata.noticeCloseDate)} (UTC); renewal ${textDate(operational.metadata.renewalDate)} (UTC)`}.`
        }
      }
      // Query order selects the latest source event in an episode/evidence key.
      const identity = isRisk ? correlationKey : row.dedupeKey ?? correlationKey
      if (seen.has(identity)) continue
      seen.add(identity)
      const severity = row.eventType === E.COMMITMENT_AMOUNT_CHANGED && data.direction === "decrease" ? "info"
        : row.severity === "critical" ? "critical" : row.severity === "warning" || row.severity === "watch" ? "warning" : "info"
      signals.push({ id: `commitguard-event-${row.id}`, source: "commitguard", signalType: row.eventType,
        title: TITLES[row.eventType], summary: description, severity,
        entityType: commitment ? "commitment" : candidate ? "commitment_detection_candidate" : "commitguard_cash_risk_episode",
        entityId: commitment?.id ?? candidate?.id ?? row.cycleKey, entityName: commitment?.name ?? candidate?.name ?? null,
        actionUrl: `/dashboard/commitguard?eventId=${encodeURIComponent(row.id)}#event-${encodeURIComponent(row.id)}`,
        recommendedAction: isRisk ? "Review saved cash inputs and protected commitments." : "Review the CommitGuard event and current obligation.",
        financialImpactCents: code === "aud" ? impact : null,
        currentValue: isRisk ? summary.freeCash.freeCashCents : null,
        detectedAt: row.occurredAt, correlationKey,
        metadata: { eventId: row.id, cycleKey: row.cycleKey, inputRevision: row.inputRevision,
          currency: code, sourceSeverity: row.severity, impactCents: impact,
          sourceOccurredAt: row.occurredAt.toISOString(), occurrenceDate: textDate(data.occurrenceDate),
          renewalDate: textDate(data.renewalDate), noticeCloseDate: textDate(data.noticeCloseDate),
          ...(isRisk ? { episodeId: row.cycleKey, cashInputRevision: summary.inputRevision,
            horizonDays: summary.selectedHorizonDays, status: summary.freeCash.status } : {}) },
      })
    }
    // Preserve the existing live summary signal before the first evaluator run,
    // never resurrect a resolved/suspended episode or duplicate its active event.
    const status = summary.freeCash.status
    if (!state?.cashRiskEpisodeId && summary.quality.state === "complete" && summary.currency &&
      (status === "shortfall" ? settings.alertCommitmentShortfall :
        (status === "watch" || status === "at_risk") && settings.alertCommitmentBufferLow)) {
      const code = summary.currency
      const impact = status === "shortfall" ? Math.max(0, -(summary.freeCash.freeCashCents ?? 0))
        : Math.max(0, (summary.freeCash.safetyBufferCents ?? 0) - (summary.freeCash.freeCashCents ?? 0))
      signals.push({ id: "commitguard-free-cash", source: "commitguard", signalType: "FREE_CASH_RISK",
        title: `Free cash is ${formatCommitGuardMoney(summary.freeCash.freeCashCents, code)} after protected commitments`,
        summary: "Saved cash inputs indicate pressure in the current commitment outlook.",
        severity: status === "shortfall" ? "critical" : "warning", actionUrl: "/dashboard/commitguard#commitguard-cash-context",
        financialImpactCents: code === "aud" ? impact : null, currentValue: summary.freeCash.freeCashCents,
        detectedAt: new Date(`${summary.cashContext.balanceAsOf}T00:00:00Z`), correlationKey: pressureKey(code),
        metadata: { currency: code, sourceSeverity: status === "watch" ? "watch" : status === "shortfall" ? "critical" : "warning",
          inputRevision: summary.inputRevision, calculationRevision: summary.calculationRevision, sourceDates: summary.sourceDates },
      })
    }
    return signals
  }, { isolationLevel: "RepeatableRead" })
}