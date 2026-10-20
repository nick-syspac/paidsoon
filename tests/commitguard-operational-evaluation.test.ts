import assert from "node:assert/strict"
import { test } from "node:test"
import { assessRenewalSeverity } from "@/lib/commitguard/engine"
import { COMMIT_GUARD_EVENT_TYPES as EVENT } from "@/lib/commitguard/events"
import { buildCommitGuardOperationalEvents, type OperationalCommitment,
  type OperationalEvent, type OperationalHistory, type OperationalPreferences } from "@/lib/commitguard/operationalEvaluation"

const settings: OperationalPreferences = { enabled: true, calculationRevision: 7,
  alertCommitmentDueSoon: true, alertRenewalApproaching: true, alertNoticePeriodApproaching: true,
  renewalWarningDays: [90, 60, 30, 14, 7] }
function row(patch: Partial<OperationalCommitment> = {}): OperationalCommitment {
  return { id: "commitment", name: "Test obligation", amountCents: 12300, currency: "AUD",
    frequency: "one_off", confidence: "confirmed", status: "active", archivedAt: null,
    nextDueDate: null, startDate: null, endDate: null, renewalDate: null, noticePeriodDays: null, ...patch }
}
function history(events: OperationalEvent[]): OperationalHistory[] {
  return events.map((event, index) => ({ ...event, id: `event-${index}` }))
}
function evaluate(commitments: OperationalCommitment[], now = "2026-10-19T23:59:59.999Z",
  previous: OperationalHistory[] = [], preferences = settings, advancedAlerts = true): OperationalEvent[] {
  return buildCommitGuardOperationalEvents({ commitments, now: new Date(now), history: previous,
    settings: preferences, advancedAlerts })
}

test("6.5 due projection uses exactly UTC today through day seven, never rolling 168h or overdue anchors", () => {
  const events = evaluate(["2026-10-18T23:59:59Z", "2026-10-19T00:00:00Z", "2026-10-26T23:59:59Z",
    "2026-10-27T00:00:00Z"].map((value, index) => row({ id: String(index), nextDueDate: new Date(value) })))
  assert.deepEqual(events.map((event) => event.metadata.occurrenceDate), ["2026-10-19", "2026-10-26"])
  assert.deepEqual(events.map((event) => event.dedupeKey), ["commitguard:due-soon:1:2026-10-19", "commitguard:due-soon:2:2026-10-26"])
})

test("6.5 actual engine skips old weekly anchors and preserves monthly/leap-year anchors", () => {
  assert.deepEqual(evaluate([row({ frequency: "weekly", nextDueDate: new Date("1900-01-01Z") })])
    .map((event) => event.metadata.occurrenceDate), ["2026-10-19", "2026-10-26"])
  for (const [frequency, anchor, now, expected] of [
    ["monthly", "0001-01-31", "2028-02-28", "2028-02-29"],
    ["monthly", "0001-01-31", "2028-03-25", "2028-03-31"],
    ["annual", "0004-02-29", "2028-02-28", "2028-02-29"],
  ]) {
    assert.deepEqual(evaluate([row({ frequency, nextDueDate: new Date(`${anchor}T00:00:00Z`) })], `${now}T12:00:00Z`)
      .map((event) => event.metadata.occurrenceDate), [expected])
  }
})

test("6.5 inactive/archive exclusions apply equally to due events and renewals; active statuses remain eligible", () => {
  for (const status of ["paused", "expired", "cancelled", "archived"]) {
    assert.deepEqual(evaluate([row({ status, nextDueDate: new Date("2026-10-20"), renewalDate: new Date("2026-10-21") })]), [])
  }
  assert.deepEqual(evaluate([row({ archivedAt: new Date("2026-10-01"), nextDueDate: new Date("2026-10-20"),
    renewalDate: new Date("2026-10-21") })]), [])
  for (const status of ["active", "upcoming", "ending", "review"]) {
    assert.equal(evaluate([row({ status, nextDueDate: new Date("2026-10-20") })]).length, 1)
  }
})

test("6.5 due respects start/end boundaries and unsupported schedules never invent a one-off", () => {
  assert.deepEqual(evaluate([row({ frequency: "weekly", nextDueDate: new Date("1900-01-01Z"),
    startDate: new Date("2026-10-20"), endDate: new Date("2026-10-25") })]), [])
  assert.deepEqual(evaluate([row({ frequency: "weekly", nextDueDate: new Date("1900-01-01Z"),
    startDate: new Date("2026-10-26"), endDate: new Date("2026-10-26") })])
    .map((event) => event.metadata.occurrenceDate), ["2026-10-26"])
  assert.deepEqual(evaluate([row({ frequency: "custom", nextDueDate: new Date("2026-10-20") }), row()]), [])
})

test("6.5 current module, advanced access and independent category controls gate events", () => {
  const commitment = row({ nextDueDate: new Date("2026-10-20"), renewalDate: new Date("2026-10-21") })
  assert.deepEqual(evaluate([commitment], undefined, [], { ...settings, enabled: false }), [])
  assert.deepEqual(evaluate([commitment], undefined, [], settings, false), [])
  assert.deepEqual(evaluate([commitment], undefined, [], { ...settings, alertCommitmentDueSoon: false,
    alertRenewalApproaching: false }).map((event) => event.eventType), [EVENT.COMMITMENT_NOTICE_PERIOD_APPROACHING])
  assert.deepEqual(evaluate([commitment], undefined, [], { ...settings, alertNoticePeriodApproaching: false })
    .map((event) => event.eventType), [EVENT.COMMITMENT_DUE_SOON, EVENT.COMMITMENT_RENEWAL_APPROACHING])
})

test("6.5 renewal bands use sorted unique positive thresholds including all watch windows, one and two threshold policies", () => {
  const renewalDate = new Date("2027-01-01Z")
  for (const [warnings, days, expected] of [
    [[90, 60, 30, 14, 7], 80, "watch"], [[90, 60, 30, 14, 7], 14, "action_required"],
    [[90, 60, 30, 14, 7], 7, "urgent"], [[7], 8, "info"], [[7], 7, "urgent"],
    [[7, 30], 31, "info"], [[7, 30], 30, "action_required"], [[7, 7, -1, 0, 2.5, NaN], 8, "info"],
  ] as const) {
    assert.equal(assessRenewalSeverity({ renewalDate, noticePeriodDays: 0, warningDays: [...warnings],
      now: new Date(renewalDate.getTime() - days * 86400000) }), expected)
  }
})

test("6.5 first observation emits most urgent reached threshold only, skips missed bands and never daily countdown keys", () => {
  const commitment = row({ renewalDate: new Date("2026-11-18"), noticePeriodDays: 0 })
  const first = evaluate([commitment])
  assert.equal(first.length, 2)
  assert.ok(first.every((event) => event.metadata.thresholdDays === 30))
  const next = evaluate([commitment], "2026-10-20T00:00:00Z", history(first))
  assert.deepEqual(next.map((event) => event.dedupeKey), first.map((event) => event.dedupeKey))
  const urgent = evaluate([commitment], "2026-11-12T00:00:00Z", history(first))
  assert.ok(urgent.every((event) => event.metadata.thresholdDays === 7 && event.severity === "critical"))
  assert.ok(urgent.every((event) => !first.some((old) => old.dedupeKey === event.dedupeKey)))
  assert.deepEqual(evaluate([commitment], "2026-10-19T00:00:00Z", history([...first, ...urgent])), [])
})

test("6.5 notice deadline day is actionable; missed deadlines produce one distinct historical key, not approaching warnings", () => {
  const commitment = row({ renewalDate: new Date("2026-10-26"), noticePeriodDays: 7 })
  const today = evaluate([commitment])
  assert.equal(today.length, 2); assert.ok(today.every((event) => event.relevance === "active"))
  const missed = evaluate([commitment], "2026-10-20T00:00:00Z", history(today))
  assert.equal(missed.length, 1); assert.equal(missed[0].eventType, EVENT.COMMITMENT_NOTICE_PERIOD_APPROACHING)
  assert.equal(missed[0].metadata.missedDeadline, true); assert.equal(missed[0].relevance, "historical")
  assert.deepEqual(evaluate([commitment], "2026-11-01T23:59:59Z", history(missed)).map((event) => event.dedupeKey),
    missed.map((event) => event.dedupeKey))
  assert.deepEqual(evaluate([commitment], "2026-10-20Z").map((event) => event.dedupeKey), missed.map((event) => event.dedupeKey))
})

test("6.5 renewal/notice edits establish a new cycle; revisions alone preserve event identity", () => {
  const commitment = row({ renewalDate: new Date("2026-11-01"), noticePeriodDays: 7 })
  const first = evaluate([commitment])
  const revision = evaluate([commitment], undefined, history(first), { ...settings, calculationRevision: 99 })
  assert.deepEqual(first.map((event) => event.dedupeKey), revision.map((event) => event.dedupeKey))
  for (const patch of [{ renewalDate: new Date("2026-11-02") }, { noticePeriodDays: 8 }]) {
    const next = evaluate([{ ...commitment, ...patch }], undefined, history(first))
    assert.ok(next.every((event) => !first.some((old) => old.cycleKey === event.cycleKey)))
  }
})