import type { Prisma } from "@/lib/generated/prisma/client"
import type { PrismaTx } from "@/lib/db/withUserContext"
import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { financialJobAccessSkip } from "@/lib/billing/financialJobAccess"
import { COMMIT_GUARD_EVENT_TYPES as EVENT } from "@/lib/commitguard/events"
import { assessRenewalSeverity, CommitmentProjectionError, normalizeRenewalWarningDays,
  projectCommitmentOccurrences, type CommitmentScheduleSnapshot } from "@/lib/commitguard/engine"
import { normalizeCommitmentConfidence, normalizeCommitmentFrequency, normalizeCommitmentStatus } from "@/lib/commitguard/types"

const DAY = 86_400_000
const OPERATIONAL_TYPES = [EVENT.COMMITMENT_DUE_SOON, EVENT.COMMITMENT_RENEWAL_APPROACHING,
  EVENT.COMMITMENT_NOTICE_PERIOD_APPROACHING]
const ACTIVE = new Set(["active", "upcoming", "ending", "review"])
type OperationalType = typeof OPERATIONAL_TYPES[number]

export type OperationalCommitment = Omit<CommitmentScheduleSnapshot, "frequency" | "status" | "confidence"> & {
  frequency: string; status: string; confidence: string
  renewalDate: Date | null; noticePeriodDays: number | null
}
export interface OperationalPreferences {
  enabled: boolean
  calculationRevision: number
  alertCommitmentDueSoon: boolean
  alertRenewalApproaching: boolean
  alertNoticePeriodApproaching: boolean
  renewalWarningDays: unknown
}
export interface OperationalHistory {
  id: string; commitmentId: string | null; eventType: string; dedupeKey: string | null
  cycleKey: string | null; relevance: string; metadata: unknown
}
export interface OperationalEvent {
  commitmentId: string; eventType: OperationalType; dedupeKey: string; cycleKey: string
  occurrenceDate: Date | null; inputRevision: number; relevance: "active" | "historical"
  severity: "critical" | "warning" | "watch"; title: string; message: string
  metadata: Prisma.InputJsonObject
}

function date(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}
function iso(value: Date): string { return value.toISOString().slice(0, 10) }
function eligible(row: OperationalCommitment): boolean {
  return !row.archivedAt && ACTIVE.has(row.status.trim().toLowerCase())
}
function preference(settings: OperationalPreferences, type: string): boolean {
  return type === EVENT.COMMITMENT_DUE_SOON ? settings.alertCommitmentDueSoon
    : type === EVENT.COMMITMENT_RENEWAL_APPROACHING ? settings.alertRenewalApproaching
      : settings.alertNoticePeriodApproaching
}
function threshold(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || !("thresholdDays" in metadata)) return null
  const value = metadata.thresholdDays
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null
}

/** D8 timeline only. One clock, original-anchor projection and stable cycle keys.
 * History is evidence for crossings, not permission to emit an alert. No risk,
 * digest, mail, evaluation-state writes or transaction creation belongs here. */
export function buildCommitGuardOperationalEvents(input: {
  commitments: OperationalCommitment[]; settings: OperationalPreferences
  history: OperationalHistory[]; advancedAlerts: boolean; now: Date
}): OperationalEvent[] {
  const { settings, history } = input
  if (!settings.enabled || !input.advancedAlerts) return []
  const today = date(input.now)
  const end = new Date(today.getTime() + 8 * DAY) // today THROUGH day 7 inclusive
  const warnings = normalizeRenewalWarningDays(Array.isArray(settings.renewalWarningDays)
    ? settings.renewalWarningDays.filter((value): value is number => typeof value === "number") : [])
  const events: OperationalEvent[] = []
  for (const row of input.commitments) {
    if (!eligible(row)) continue
    if (settings.alertCommitmentDueSoon) {
      try {
        for (const occurrence of projectCommitmentOccurrences({ commitment: { ...row,
          frequency: normalizeCommitmentFrequency(row.frequency), status: normalizeCommitmentStatus(row.status),
          confidence: normalizeCommitmentConfidence(row.confidence) }, windowStart: today, windowEnd: end })) {
          const due = iso(occurrence.dueDate)
          events.push({ commitmentId: row.id, eventType: EVENT.COMMITMENT_DUE_SOON,
            dedupeKey: `commitguard:due-soon:${row.id}:${due}`, cycleKey: `due:${row.id}:${due}`,
            occurrenceDate: occurrence.dueDate, inputRevision: settings.calculationRevision,
            relevance: "active", severity: "watch", title: "Commitment due soon",
            message: `${row.name} is due on ${due}.`, metadata: { occurrenceDate: due,
              currency: occurrence.currency, amountCents: occurrence.amountCents } })
        }
      } catch (error) {
        // Legacy custom/missing schedules are unavailable, never guessed as
        // one-off. They must not prevent other valid obligations being evaluated.
        if (!(error instanceof CommitmentProjectionError)) throw error
      }
    }
    if (!row.renewalDate) continue
    const renewal = date(row.renewalDate)
    const close = new Date(renewal.getTime() - Math.max(0, row.noticePeriodDays ?? 0) * DAY)
    const days = Math.round((close.getTime() - today.getTime()) / DAY)
    const cycleKey = `renewal:${row.id}:${iso(renewal)}:${iso(close)}`
    const band = warnings.find((value) => days <= value)
    for (const eventType of [EVENT.COMMITMENT_RENEWAL_APPROACHING, EVENT.COMMITMENT_NOTICE_PERIOD_APPROACHING]) {
      if (!preference(settings, eventType)) continue
      const missed = days < 0
      // No approaching renewal after its decision deadline. The notice category
      // records ONE historical missed-deadline event, including first catch-up.
      if (missed && eventType !== EVENT.COMMITMENT_NOTICE_PERIOD_APPROACHING) continue
      if (!missed && band === undefined) continue
      const previous = history.filter((event) => event.commitmentId === row.id &&
        event.eventType === eventType && event.cycleKey === cycleKey)
      const thresholds = previous.map((event) => threshold(event.metadata)).filter((value): value is number => value !== null)
      // A delayed first observation emits only the most urgent reached threshold;
      // settings edits/time reversal cannot backfill less urgent crossings.
      if (!missed && thresholds.some((value) => value < band!)) continue
      const suffix = missed ? "missed" : `threshold:${band}`
      const severity = missed ? "urgent" : assessRenewalSeverity({ renewalDate: renewal,
        noticePeriodDays: row.noticePeriodDays ?? 0, warningDays: warnings, now: today })
      events.push({ commitmentId: row.id, eventType,
        dedupeKey: `commitguard:${eventType}:${cycleKey}:${suffix}`, cycleKey,
        occurrenceDate: null, inputRevision: settings.calculationRevision,
        relevance: missed ? "historical" : "active",
        severity: severity === "urgent" ? "critical" : severity === "action_required" ? "warning" : "watch",
        title: missed ? "Commitment notice deadline missed" : eventType === EVENT.COMMITMENT_RENEWAL_APPROACHING
          ? "Commitment renewal approaching" : "Commitment notice period approaching",
        message: missed ? `${row.name} notice deadline was missed on ${iso(close)}.`
          : `${row.name} notice period closes on ${iso(close)}; renewal is ${iso(renewal)}.`,
        metadata: { renewalDate: iso(renewal), noticeCloseDate: iso(close),
          thresholdDays: missed ? null : band!, missedDeadline: missed, currency: row.currency.toLowerCase() } })
    }
  }
  return events
}

/** Internal trusted evaluator: caller MUST be the D7 fenced tenant transaction.
 * No independent withUserContext/admin path and no GET callers. */
export async function evaluateCommitGuardOperationalEvents(input: {
  tx: PrismaTx; userId: string; access: EffectiveAccess; now: Date
}): Promise<void> {
  const { tx, userId, now } = input
  const settings = await tx.commitGuardSetting.findUnique({ where: { userId } })
  if (!settings) return
  const advancedAlerts = financialJobAccessSkip(input.access, "commitguard_advanced_alerts") === null
  const commitments = await tx.commitment.findMany({ where: { userId }, orderBy: { id: "asc" } })
  const history = await tx.commitmentEvent.findMany({ where: { userId, eventType: { in: OPERATIONAL_TYPES } },
    select: { id: true, commitmentId: true, eventType: true, dedupeKey: true,
      cycleKey: true, relevance: true, metadata: true } })
  const events = buildCommitGuardOperationalEvents({ commitments, settings, history, advancedAlerts, now })
  const keys = new Set(events.map((event) => event.dedupeKey))
  const byId = new Map(commitments.map((row) => [row.id, row]))
  for (const old of history) {
    if (keys.has(old.dedupeKey ?? "") || old.relevance === "superseded") continue
    const row = old.commitmentId ? byId.get(old.commitmentId) : undefined
    const suspended = !settings.enabled || !advancedAlerts || !preference(settings, old.eventType) || (row && !eligible(row))
    const currentCycle = row?.renewalDate ? `renewal:${row.id}:${iso(date(row.renewalDate))}:${iso(new Date(
      date(row.renewalDate).getTime() - Math.max(0, row.noticePeriodDays ?? 0) * DAY))}` : null
    const changedCycle = old.eventType !== EVENT.COMMITMENT_DUE_SOON && old.cycleKey !== currentCycle
    const relevance = changedCycle ? "superseded" : suspended ? "suspended"
      : old.relevance === "historical" ? "historical" : "resolved"
    if (relevance === old.relevance) continue
    await tx.commitmentEvent.updateMany({ where: { id: old.id, userId },
      data: { relevance, resolvedAt: relevance === "suspended" ? null : now } })
  }
  for (const event of events) {
    // A missed-deadline catch-up is immutable history, not a daily timestamp
    // refresh. Preserve its original observation and resolved date on retries.
    if (event.relevance === "historical" && history.some((old) =>
      old.dedupeKey === event.dedupeKey && old.relevance === "historical")) continue
    await tx.commitmentEvent.upsert({ where: { userId_dedupeKey: { userId, dedupeKey: event.dedupeKey } },
      create: { ...event, userId, occurredAt: now, resolvedAt: event.relevance === "historical" ? now : null },
      update: { ...event, resolvedAt: event.relevance === "historical" ? now : null } })
  }
}