import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { assembleCashPlanInputs } from "@/lib/cashplan/assembler"
import { assembleCashPlanFacts, cashPlanSnapshotFactsHash, cashPlanSnapshotFactsMetadata,
  type CashPlanFactSnapshot, type CashPlanBillInput, type CashPlanCommitmentInput } from "@/lib/cashplan/factAssembler"
import type { CoverageRecord } from "@/lib/commitguard/coverage"
import { toCommitGuardCashContextDto } from "@/lib/commitguard/cashContext"

const now = new Date("2026-10-19T01:00:00Z")
const date = (value: string): Date => new Date(`${value}T00:00:00Z`)
const userId = "tenant-owner"
function inputs(amountCents: number | null = 100_000, currency = "aud", timezone = "Australia/Sydney") {
  return assembleCashPlanInputs({ plan: { id: "plan-a", name: "Plan", currency, timezone,
    horizonWeeks: 13, bufferTargetCents: 50_000, updatedAt: now }, settings: null, now,
    cashContext: toCommitGuardCashContextDto(amountCents === null ? null : { amountCents, currency: "aud",
      balanceAsOf: date("2026-10-19"), weeklyOperatingExpensesCents: 80_000,
      weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: date("2026-10-19"), taxProtectionCurrency: "aud", revision: 9 }, now) })
}
function commitment(overrides: Partial<CashPlanCommitmentInput> = {}): CashPlanCommitmentInput {
  return { id: "commit-a", userId, name: "Commitment", category: "tax", amountCents: 10_000, currency: "aud",
    frequency: "one_off", confidence: "potential", status: "active", archivedAt: null,
    nextDueDate: date("2026-10-20"), startDate: null, endDate: null, updatedAt: now, ...overrides }
}
function bill(overrides: Partial<CashPlanBillInput> = {}): CashPlanBillInput {
  return { id: "bill-a", userId, accountingConnectionId: "connection-a", sourceId: "provider-bill-a",
    amountCents: 10_000, currency: "aud", dueDate: date("2026-10-21"), paidDate: null,
    status: "open", rawSourceData: { AmountDue: 60 }, sourceUpdatedAt: now, syncedAt: now,
    accountingConnection: { userId, provider: "xero" }, ...overrides }
}
function link(overrides: Partial<CoverageRecord> = {}): CoverageRecord {
  return { id: "coverage-a", userId, commitmentId: "commit-a", occurrenceDate: date("2026-10-20"),
    currency: "aud", coveredCents: 6000, targetKind: "imported_bill", importedBillId: "bill-a",
    taxReserveCategoryId: null, ...overrides }
}
function assemble(overrides: Partial<Parameters<typeof assembleCashPlanFacts>[0]> = {}) {
  return assembleCashPlanFacts({ userId, inputs: inputs(), enabled: true, commitmentRevision: 7,
    commitments: [commitment()], coverages: [link()], bills: [bill()], ...overrides })
}
function snapshot(): CashPlanFactSnapshot {
  const result = assemble()
  const canonicalFacts = cashPlanSnapshotFactsMetadata(result.inputs, result.facts)
  const inputQuality = result.quality
  return { id: "snapshot-a", planId: "plan-a", scenarioId: null, inputVersion: 2,
    anchorDate: date("2026-10-19"), inputCurrency: "aud", cashInputRevision: 9, commitmentRevision: 7,
    canonicalFacts, coverage: result.coverage, inputQuality,
    inputHash: cashPlanSnapshotFactsHash({ planId: "plan-a", anchorDate: "2026-10-19", currency: "aud",
      cashInputRevision: 9, commitmentRevision: 7, canonicalFacts, coverage: result.coverage, inputQuality }) }
}
const residual = (result: ReturnType<typeof assemble>): number | undefined =>
  result.facts.find((fact) => fact.sourceSystem === "commitguard")?.amountCents

describe("CashPlan 8.2 bounded canonical fact assembly", () => {
  test("6000 bill actually included leaves 4000, preserving source/currency/revision/coverage lineage", () => {
    const result = assemble()
    assert.equal(residual(result), 4000)
    assert.equal(result.facts.length, 2)
    assert.equal(result.facts[0].id, "commitguard:commit-a:2026-10-20")
    assert.equal(result.facts[1].sourceId, "connection-a:xero:provider-bill-a")
    assert.equal(result.facts[0].currency, "aud")
    assert.equal(result.facts[0].sourceRevision, `7:${now.toISOString()}`)
    assert.deepEqual(result.facts.map((fact) => fact.coverageIds), [["coverage-a"], ["coverage-a"]])
    assert.deepEqual(result.coverage, [{ coverageId: "coverage-a", occurrenceId: "commitguard:commit-a:2026-10-20",
      billFactId: "imported_bill:bill-a", amountCents: 6000, currency: "aud" }])
    assert.equal(result.forecast?.weeks[0].openingCashCents, 100_000)
    assert.equal(result.forecast?.weeks[0].closingCashCents, 90_000)
    assert.equal(result.forecast?.weeks[0].outflowCents, 10_000)
    assert.equal(result.quality.state, "preliminary")
    assert.equal(JSON.stringify(result).includes("supplier"), false)
  })
  const invalidBills: Array<[string, Partial<CashPlanBillInput>]> = [
    ["paid status", { status: "paid" }], ["paid date", { paidDate: now }], ["void", { status: "void" }],
    ["uppercase status", { status: "OPEN" }], ["excluded status", { status: "excluded" }],
    ["currency incompatible", { currency: "usd" }], ["out of window", { dueDate: date("2027-01-18") }],
    ["past due", { dueDate: date("2026-10-18") }], ["missing due", { dueDate: null }],
    ["invalid due", { dueDate: new Date("invalid") }], ["no explicit remaining", { rawSourceData: {} }],
    ["string due date", { dueDate: "2026-10-21" as unknown as Date }],
    ["string remaining", { rawSourceData: { AmountDue: "60" } }],
    ["zero remaining", { rawSourceData: { AmountDue: 0 } }], ["negative zero remaining", { rawSourceData: { AmountDue: -0 } }],
    ["negative remaining", { rawSourceData: { AmountDue: -60 } }],
    ["fractional cent", { rawSourceData: { AmountDue: 60.001 } }],
    ["greater than bill total", { rawSourceData: { AmountDue: 101 } }],
    ["provider exact", { accountingConnection: { userId, provider: "Xero" } }],
    ["unsupported provider", { accountingConnection: { userId, provider: "quickbooks" } }],
    ["foreign connection", { accountingConnection: { userId: "other", provider: "xero" } }],
    ["blank source ID", { sourceId: "" }], ["blank connection ID", { accountingConnectionId: "" }],
    ["whitespace source ID", { sourceId: "   " }],
  ]
  for (const [label, patch] of invalidBills) test(`${label} bill never erases commitment residual`, () => {
    const result = assemble({ bills: [bill(patch)] })
    assert.equal(residual(result), 10_000)
    assert.equal(result.facts.length, 1)
    assert.deepEqual(result.coverage, [])
    assert.ok(result.quality.issues.some((issue) => issue.reason === "coverage_review"))
  })
  test("absent bill cannot erase a commitment", () => {
    const result = assemble({ bills: [] })
    assert.equal(residual(result), 10_000)
    assert.ok(result.quality.reasons.includes("coverage_review"))
  })
  test("unlinked bills are excluded even when otherwise valid", () => {
    const result = assemble({ coverages: [] })
    assert.equal(result.facts.length, 1)
    assert.equal(residual(result), 10_000)
    assert.ok(result.quality.reasons.includes("commitments_only"))
  })
  test("MYOB uses BalanceDue exactly, not Xero AmountDue", () => {
    const myob = bill({ accountingConnection: { userId, provider: "myob" }, rawSourceData: { BalanceDue: 60 } })
    assert.equal(residual(assemble({ bills: [myob] })), 4000)
    assert.equal(residual(assemble({ bills: [{ ...myob, rawSourceData: { AmountDue: 60 } }] })), 10_000)
  })
  for (const patch of [
    { coveredCents: 0 }, { coveredCents: -1 }, { coveredCents: 10_001 }, { currency: "usd" },
    { taxReserveCategoryId: "tax-a" }, { occurrenceDate: date("2026-10-21") }, { importedBillId: "missing" },
  ]) test(`invalid coverage ${JSON.stringify(patch)} cannot deduct`, () => {
    assert.equal(residual(assemble({ coverages: [link(patch)] })), 10_000)
  })
  test("duplicate and globally overallocated bill links fail as a group without iteration-order deductions", () => {
    assert.equal(residual(assemble({ coverages: [link(), link({ id: "duplicate" })] })), 10_000)
    const result = assemble({ commitments: [commitment(), commitment({ id: "second", nextDueDate: date("2027-02-01") })],
      coverages: [link(), link({ id: "outside", commitmentId: "second", occurrenceDate: date("2027-02-01") })] })
    assert.equal(residual(result), 10_000)
  })
  test("full amount of a partly covered bill enters once, not once per commitment", () => {
    const result = assemble({ commitments: [commitment(), commitment({ id: "second" })],
      coverages: [link({ coveredCents: 3000 }), link({ id: "second-link", commitmentId: "second", coveredCents: 3000 })] })
    assert.equal(result.facts.filter((fact) => fact.sourceSystem === "imported_bill").length, 1)
    assert.equal(result.facts.reduce((sum, fact) => sum + fact.amountCents, 0), 20_000)
  })
  test("cross-currency commitments are excluded, never FX-converted or mixed", () => {
    const result = assemble({ commitments: [commitment(), commitment({ id: "usd", currency: "usd", amountCents: 90_000 })] })
    assert.equal(result.forecast?.weeks[0].outflowCents, 10_000)
    assert.ok(result.quality.issues.some((issue) => issue.sourceId === "usd" && issue.reason === "currency_excluded"))
    assert.ok(result.facts.every((fact) => fact.currency === "aud"))
  })
  for (const amount of [0, -123]) test(`gross opening cash ${amount} is retained without tax/expense/buffer subtraction`, () => {
    const result = assemble({ inputs: inputs(amount), coverages: [] })
    assert.equal(result.forecast?.weeks[0].openingCashCents, amount)
    assert.equal(result.forecast?.weeks[0].closingCashCents, amount - 10_000)
    assert.equal(result.facts.length, 1)
  })
  for (const amount of [0, -1, Number.NaN, 2_147_483_648]) test(`commitment amount ${amount} is validated before engine normalization`, () => {
    const result = assemble({ commitments: [commitment({ amountCents: amount })], coverages: [], bills: [] })
    assert.equal(result.facts.length, amount === 0 ? 1 : 0)
    if (amount !== 0) assert.ok(result.quality.reasons.includes("projection_incomplete"))
  })
  for (const status of ["paused", "cancelled", "expired"]) test(`${status} contributes no occurrences or covered bills`, () => {
    assert.equal(assemble({ commitments: [commitment({ status })] }).facts.length, 0)
  })
  test("unsupported custom and invalid source IDs are surfaced, not fabricated", () => {
    for (const patch of [{ frequency: "custom" }, { id: "" }, { status: "unknown" }]) {
      const result = assemble({ commitments: [commitment(patch)] })
      assert.equal(result.facts.length, 0)
      assert.ok(result.quality.reasons.includes("projection_incomplete"))
    }
  })
  test("missing or incompatible cash exposes no internal zero-based forecast", () => {
    for (const configuration of [inputs(null), inputs(100_000, "usd")]) {
      const result = assemble({ inputs: configuration })
      assert.equal(result.forecast, null)
      assert.equal(result.quality.state, "unavailable")
    }
  })
  test("disabled contribution retains gross cash but adds no commitment or bill", () => {
    const result = assemble({ enabled: false })
    assert.deepEqual(result.facts, [])
    assert.equal(result.forecast?.weeks[0].openingCashCents, 100_000)
    assert.ok(result.quality.reasons.includes("commitguard_disabled"))
  })
  test("timezone-local UTC-date indexing is used for occurrences and bill coverage", () => {
    const result = assemble({ inputs: inputs(100_000, "aud", "America/New_York"),
      commitments: [commitment({ nextDueDate: date("2026-10-25") })],
      coverages: [link({ occurrenceDate: date("2026-10-25") })], bills: [bill({ dueDate: date("2026-10-25") })] })
    assert.deepEqual(result.facts.map((fact) => fact.weekIndex), [0, 0])
  })
  test("validated v2 facts reuse exact live references without stacking weeks or duplicate commitments", () => {
    const result = assemble({ snapshot: snapshot() })
    assert.equal(result.reusedSnapshotId, "snapshot-a")
    assert.equal(result.facts.length, 2)
    assert.equal(result.forecast?.weeks[0].outflowCents, 10_000)
    assert.equal(result.quality.state, "preliminary")
  })
  test("JSONB key reordering does not invalidate canonical lineage or input digest", () => {
    const value = snapshot()
    function reorder(input: unknown): unknown {
      if (Array.isArray(input)) return input.map(reorder)
      if (input && typeof input === "object") return Object.fromEntries(
        Object.entries(input).reverse().map(([key, item]) => [key, reorder(item)]))
      return input
    }
    value.canonicalFacts = reorder(value.canonicalFacts)
    value.coverage = reorder(value.coverage)
    value.inputQuality = reorder(value.inputQuality)
    assert.equal(assemble({ snapshot: value }).reusedSnapshotId, "snapshot-a")
  })
  const mutations: Array<[string, (value: CashPlanFactSnapshot) => void]> = [
    ["foreign plan", (value) => { value.planId = "other" }], ["scenario", (value) => { value.scenarioId = "other" }],
    ["old anchor", (value) => { value.anchorDate = date("2026-10-18") }],
    ["currency", (value) => { value.inputCurrency = "usd" }],
    ["cash revision", (value) => { value.cashInputRevision = 8 }],
    ["commitment revision", (value) => { value.commitmentRevision = 6 }],
    ["bad hash", (value) => { value.inputHash = "opaque" }],
    ["unvalidated quality", (value) => { value.inputQuality = { state: "healthy" } }],
    ["opaque weeks", (value) => { value.canonicalFacts = { weeks: [{ outflowCents: 999999 }] } }],
    ["coverage refs", (value) => { value.coverage = [] }],
    ["settings revision", (value) => { (value.canonicalFacts as Record<string, unknown>).settingsRevision = "old" }],
    ["fact source ID", (value) => { const data = value.canonicalFacts as { facts: Array<{ sourceId: string }> }; data.facts[0].sourceId = "missing" }],
    ["invented source", (value) => { const data = value.canonicalFacts as { facts: Array<{ sourceSystem: string }> }; data.facts[0].sourceSystem = "imaginary" }],
  ]
  for (const [label, mutate] of mutations) test(`v2 ${label} is rejected conservatively without erasing current residual`, () => {
    const value = snapshot()
    mutate(value)
    const result = assemble({ snapshot: value })
    assert.equal(result.reusedSnapshotId, null)
    assert.equal(result.forecast?.weeks[0].outflowCents, 10_000)
    assert.ok(result.quality.reasons.includes("snapshot_lineage_review"))
  })
  test("old opaque snapshots remain historical without affecting new commitment-only projection", () => {
    const result = assemble({ snapshot: { ...snapshot(), inputVersion: 1 }, coverages: [], bills: [] })
    assert.equal(result.reusedSnapshotId, null)
    assert.equal(residual(result), 10_000)
    assert.ok(result.quality.reasons.includes("legacy_snapshot_review"))
    assert.ok(result.quality.reasons.includes("commitments_only"))
  })
  test("oversized v2 canonical arrays are rejected rather than merged or truncated", () => {
    const value = snapshot()
    const data = value.canonicalFacts as ReturnType<typeof cashPlanSnapshotFactsMetadata>
    data.facts = Array.from({ length: 10_001 }, () => data.facts[0])
    const result = assemble({ snapshot: value })
    assert.equal(result.reusedSnapshotId, null)
    assert.equal(result.facts.length, 2)
    assert.ok(result.quality.reasons.includes("snapshot_lineage_review"))
  })
  test("live source fact limit makes the forecast unavailable rather than asserting a truncated cash total", () => {
    const result = assemble({ commitments: Array.from({ length: 10_001 }, (_, index) => commitment({ id: `c-${index}` })),
      bills: [], coverages: [] })
    assert.equal(result.forecast, null)
    assert.equal(result.quality.state, "unavailable")
    assert.ok(result.quality.issues.some((issue) => issue.sourceId === "canonical_fact_limit"))
  })
  test("even a correctly rehashed stale/unknown fact cannot validate a missing source reference", () => {
    const value = snapshot()
    const data = value.canonicalFacts as ReturnType<typeof cashPlanSnapshotFactsMetadata>
    data.facts[0].sourceId = "missing"
    value.inputHash = cashPlanSnapshotFactsHash({ planId: value.planId, anchorDate: "2026-10-19", currency: "aud",
      cashInputRevision: 9, commitmentRevision: 7, canonicalFacts: data, coverage: assemble().coverage, inputQuality: value.inputQuality })
    assert.equal(assemble({ snapshot: value }).reusedSnapshotId, null)
  })
})