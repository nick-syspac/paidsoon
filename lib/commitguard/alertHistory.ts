import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { requireFeature } from "@/lib/billing"
import { COMMIT_GUARD_EVENT_TYPES as E } from "@/lib/commitguard/events"
import { buildCommitGuardOperationalEvents } from "@/lib/commitguard/operationalEvaluation"
import { ALERT_PAGE_SIZE, AlertQuerySchema, AlertEntityIdSchema, alertDate, alertMoney, alertTimestamp,
  type CommitGuardAlertDTO, type CommitGuardAlertPageDTO, type AlertRelevance } from "@/lib/commitguard/alertPresentation"

const TITLES: Record<string, string> = {
  [E.COMMITMENT_DUE_SOON]: "Commitment due soon", [E.COMMITMENT_AMOUNT_CHANGED]: "Commitment amount changed",
  [E.COMMITMENT_RENEWAL_APPROACHING]: "Commitment renewal approaching",
  [E.COMMITMENT_NOTICE_PERIOD_APPROACHING]: "Commitment notice period",
  [E.COMMITMENT_DETECTED]: "Commitment detected", [E.COMMITMENT_SHORTFALL]: "Recorded cash shortfall",
  [E.COMMITMENT_BUFFER_LOW]: "Recorded low safety buffer",
}
const TYPES = Object.keys(TITLES)
const RISK = new Set<string>([E.COMMITMENT_SHORTFALL, E.COMMITMENT_BUFFER_LOW])
function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Read-only tenant snapshot. Stored text/metadata, actor, tenant, dedupe and
 * lease identities never cross this boundary. No defaults or evaluation writes. */
export async function listCommitGuardAlerts(userId: string, query: unknown = {}, now = new Date()): Promise<CommitGuardAlertPageDTO> {
  if (!await requireFeature(userId, "commitguard_core")) throw new Error("Upgrade required")
  const parsed = AlertQuerySchema.parse(query)
  const advanced = await requireFeature(userId, "commitguard_advanced_alerts")
  const detectionAccess = await requireFeature(userId, "commitguard_detection")
  return withUserContext(userId, (tx) => listCommitGuardAlertsInTransaction(tx, userId, parsed, now, advanced, detectionAccess), { isolationLevel: "RepeatableRead" })
}

export async function listCommitGuardAlertsInTransaction(
  tx: PrismaTx, userId: string, parsed: { page: number; eventId?: string }, now: Date,
  advanced: boolean, detectionAccess: boolean,
): Promise<CommitGuardAlertPageDTO> {
    const where = { userId, eventType: { in: TYPES } }
    const [total, settings, state, cash, selected] = await Promise.all([
      tx.commitmentEvent.count({ where }),
      tx.commitGuardSetting.findUnique({ where: { userId } }),
      tx.commitGuardEvaluationState.findUnique({ where: { userId } }),
      tx.commitGuardCashContext.findUnique({ where: { userId }, select: { revision: true, balanceAsOf: true } }),
      parsed.eventId ? tx.commitmentEvent.findFirst({ where: { ...where, id: parsed.eventId },
        select: { id: true, occurredAt: true } }) : null,
    ])
    const totalPages = Math.max(1, Math.ceil(total / ALERT_PAGE_SIZE))
    const preceding = selected ? await tx.commitmentEvent.count({ where: { ...where, OR: [
      { occurredAt: { gt: selected.occurredAt } }, { occurredAt: selected.occurredAt, id: { gt: selected.id } },
    ] } }) : null
    const page = Math.min(totalPages, preceding === null ? parsed.page : Math.floor(preceding / ALERT_PAGE_SIZE) + 1)
    const rows = await tx.commitmentEvent.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ALERT_PAGE_SIZE, take: ALERT_PAGE_SIZE,
      select: { id: true, eventType: true, severity: true, occurredAt: true, resolvedAt: true,
        relevance: true, metadata: true, commitmentId: true, detectionCandidateId: true,
        dedupeKey: true, cycleKey: true, inputRevision: true } })
    // Explicit tenant predicates as well as RLS: event FKs predate composite ownership.
    const [commitments, candidates] = await Promise.all([
      tx.commitment.findMany({ where: { userId, id: { in: rows.flatMap((r) => r.commitmentId ? [r.commitmentId] : []) } } }),
      tx.commitmentDetectionCandidate.findMany({ where: { userId, id: { in: rows.flatMap((r) => r.detectionCandidateId ? [r.detectionCandidateId] : []) } },
        select: { id: true, name: true, status: true } }),
    ])
    const currentKeys = new Set(settings ? buildCommitGuardOperationalEvents({ commitments, settings,
      history: rows, advancedAlerts: advanced, now }).filter((event) => event.relevance === "active").map((event) => event.dedupeKey) : [])
    const lastEvaluatedAt = alertTimestamp(state?.lastEvaluatedAt)
    const available = Boolean(settings?.enabled && advanced && lastEvaluatedAt &&
      lastEvaluatedAt.slice(0, 10) === now.toISOString().slice(0, 10) &&
      state?.calculationRevision === settings.calculationRevision && state?.cashInputRevision === (cash?.revision ?? 0))
    const alerts = rows.map((row): CommitGuardAlertDTO => {
      const data = metadata(row.metadata)
      const commitment = commitments.find((c) => c.id === row.commitmentId)
      const candidate = candidates.find((c) => c.id === row.detectionCandidateId)
      const known = ["active", "resolved", "superseded", "suspended", "historical"].includes(row.relevance)
      let relevance = (known ? row.relevance : "historical") as AlertRelevance
      if (relevance === "active" && row.resolvedAt) relevance = "resolved"
      if (relevance === "active") {
        if (RISK.has(row.eventType)) {
          const balanceDate = alertTimestamp(cash?.balanceAsOf)?.slice(0, 10)
          const age = balanceDate ? (Date.parse(now.toISOString().slice(0, 10)) - Date.parse(balanceDate)) / 86_400_000 : -1
          const currentRisk = row.eventType === E.COMMITMENT_SHORTFALL ? state?.cashRiskStatus === "shortfall"
            : state?.cashRiskStatus === "watch" || state?.cashRiskStatus === "at_risk"
          if (!available || state?.cashRiskRelevance !== "active" || row.cycleKey !== state.cashRiskEpisodeId ||
            !currentRisk || row.inputRevision !== settings?.calculationRevision || data.status !== state.cashRiskStatus ||
            age < 0 || age > 7 || !(row.eventType === E.COMMITMENT_SHORTFALL ? settings?.alertCommitmentShortfall : settings?.alertCommitmentBufferLow)) relevance = "suspended"
        } else if (!currentKeys.has(row.dedupeKey ?? "")) relevance = "suspended"
      }
      const due = alertDate(data.occurrenceDate)
      const renewal = alertDate(data.renewalDate)
      const notice = alertDate(data.noticeCloseDate)
      const horizon = typeof data.horizonDays === "number" && [7, 30, 60, 90].includes(data.horizonDays) ? data.horizonDays : null
      const impact = alertMoney(RISK.has(row.eventType) ? data.freeCashCents :
        row.eventType === E.COMMITMENT_AMOUNT_CHANGED ? data.currentAmountCents : data.amountCents, data.currency)
      const commitmentId = commitment && AlertEntityIdSchema.safeParse(commitment.id).success ? commitment.id : null
      const pendingCandidate = detectionAccess && candidate?.status === "pending" && AlertEntityIdSchema.safeParse(candidate.id).success ? candidate.id : null
      return { id: row.id, title: TITLES[row.eventType] ?? "CommitGuard alert",
        severity: row.severity === "critical" || row.severity === "warning" || row.severity === "watch" ? row.severity : "info",
        occurredAt: alertTimestamp(row.occurredAt), resolvedAt: alertTimestamp(row.resolvedAt), relevance, impact,
        context: [commitment?.name ?? candidate?.name, due ? `Due ${due} (UTC)` : null,
          renewal ? `Renewal ${renewal} (UTC)` : null, notice ? `Notice closes ${notice} (UTC)` : null,
          horizon ? `Recorded ${horizon}-day projection` : null,
          row.eventType === E.COMMITMENT_AMOUNT_CHANGED && data.direction === "decrease" ? "Amount decreased (informational)" : null,
        ].filter(Boolean).join(" · ") || "Review saved inputs and settings for current context.",
        href: commitmentId ? `/dashboard/commitguard?commitmentId=${encodeURIComponent(commitmentId)}#alert-commitment`
          : pendingCandidate ? `/dashboard/commitguard#detection-${encodeURIComponent(pendingCandidate)}`
            : RISK.has(row.eventType) ? "/dashboard/commitguard#commitguard-cash-context" : null,
        action: commitmentId ? "View commitment" : pendingCandidate ? "Review detection" : RISK.has(row.eventType) ? "Review cash inputs" : null }
    })
    return { alerts, page, totalPages, total, evaluation: { lastEvaluatedAt, available }, eventFound: !parsed.eventId || Boolean(selected) }
}

/** Dedicated deep-link target, including paused/cancelled/archived records;
 * independent of the upcoming list's filters and pagination. */
export async function loadAlertCommitment(userId: string, id: string): Promise<{
  name: string; status: string; amount: string; nextDueDate: string | null; archived: boolean
} | null> {
  AlertEntityIdSchema.parse(id)
  if (!await requireFeature(userId, "commitguard_core")) throw new Error("Upgrade required")
  return withUserContext(userId, (tx) => loadAlertCommitmentInTransaction(tx, userId, id))
}

export async function loadAlertCommitmentInTransaction(tx: PrismaTx, userId: string, id: string): Promise<{
  name: string; status: string; amount: string; nextDueDate: string | null; archived: boolean
} | null> {
    const row = await tx.commitment.findFirst({ where: { userId, id }, select: {
      name: true, status: true, amountCents: true, currency: true, nextDueDate: true, archivedAt: true } })
    return row ? { name: row.name, status: ["active", "upcoming", "ending", "review", "paused", "cancelled", "expired"].includes(row.status) ? row.status : "Needs review",
      amount: alertMoney(row.amountCents, row.currency), nextDueDate: alertTimestamp(row.nextDueDate)?.slice(0, 10) ?? null,
      archived: Boolean(row.archivedAt) } : null
}