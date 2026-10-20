import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { assembleCashPlanInputs } from "@/lib/cashplan/assembler"
import { assembleCashPlanFacts, type CashPlanCommitmentInput, type CashPlanBillInput } from "@/lib/cashplan/factAssembler"
import { applyCashPlanOverrides, type CashPlanStoredOverride } from "@/lib/cashplan/overrides"
import { toCommitGuardCashContextDto } from "@/lib/commitguard/cashContext"
import type { CoverageRecord } from "@/lib/commitguard/coverage"

const now = new Date("2026-10-19T01:00:00Z")
const date = (value: string): Date => new Date(`${value}T00:00:00Z`)
const userId = "owner"
const inputs = assembleCashPlanInputs({ now, settings: null,
  plan: { id: "plan-a", name: "Plan", currency: "aud", timezone: "Australia/Sydney", horizonWeeks: 13,
    bufferTargetCents: 0, updatedAt: now },
  cashContext: toCommitGuardCashContextDto({ amountCents: 100_000, currency: "aud", balanceAsOf: date("2026-10-19"),
    weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null,
    taxProtectionCurrency: null, revision: 1 }, now) })
const commitment: CashPlanCommitmentInput = { id: "c-a", userId, name: "Known", category: "other",
  amountCents: 10_000, currency: "aud", frequency: "one_off", confidence: "confirmed", status: "active",
  archivedAt: null, nextDueDate: date("2026-10-20"), startDate: null, endDate: null, updatedAt: now }
const bill: CashPlanBillInput = { id: "b-a", userId, accountingConnectionId: "connection", sourceId: "source",
  currency: "aud", amountCents: 10_000, dueDate: date("2026-10-21"), paidDate: null, status: "open",
  rawSourceData: { AmountDue: 60 }, sourceUpdatedAt: now, syncedAt: now, accountingConnection: { userId, provider: "xero" } }
const coverage: CoverageRecord = { id: "link", userId, commitmentId: "c-a", occurrenceDate: date("2026-10-20"),
  currency: "aud", coveredCents: 6000, targetKind: "imported_bill", importedBillId: "b-a", taxReserveCategoryId: null }
const targetId = "commitguard:c-a:2026-10-20"
function override(patch: Partial<CashPlanStoredOverride> = {}): CashPlanStoredOverride {
  return { id: "override-a", planId: "plan-a", entityType: "outflow", entityId: targetId,
    amountCents: 8000, plannedDate: null, effectiveFrom: null, expiresAt: null,
    sourceType: "manual", sourceId: null, updatedAt: now, ...patch }
}
function assemble(overrides: CashPlanStoredOverride[], covered = false) {
  return assembleCashPlanFacts({ userId, inputs, enabled: true, commitmentRevision: 1,
    commitments: [commitment], bills: covered ? [bill] : [], coverages: covered ? [coverage] : [], overrides })
}
const fact = (result: ReturnType<typeof assemble>) => result.facts.find((row) => row.id === targetId)!

describe("CashPlan 8.3 targeted overrides through real assembler and engine", () => {
  test("latest valid amount and date replace exactly one current fact without destroying source lineage", () => {
    const result = assemble([override({ id: "older", amountCents: 9000, updatedAt: date("2026-10-18") }),
      override({ plannedDate: date("2026-11-03") })])
    assert.equal(fact(result).amountCents, 8000)
    assert.equal(fact(result).dueDate, "2026-11-03")
    assert.equal(fact(result).weekIndex, 2)
    assert.equal(fact(result).sourceId, "c-a")
    assert.equal(fact(result).sourceRevision, `1:${now.toISOString()}`)
    assert.equal(fact(result).appliedOverrideId, "override-a")
    assert.equal(result.forecast?.weeks[0].outflowCents, 0)
    assert.equal(result.forecast?.weeks[2].outflowCents, 8000)
  })
  const invalid: Array<Partial<CashPlanStoredOverride>> = [
    { amountCents: -1 }, { amountCents: 1.5 }, { amountCents: 2_147_483_648 }, { amountCents: Number.NaN },
    { plannedDate: new Date("invalid") }, { plannedDate: new Date("2026-10-21T12:00:00Z") },
    { updatedAt: new Date("invalid") }, { effectiveFrom: new Date("invalid") }, { expiresAt: new Date("invalid") },
    { effectiveFrom: now, expiresAt: now },
    { effectiveFrom: date("2026-10-20") }, { expiresAt: now }, { planId: "foreign" },
    { entityType: "inflow" }, { entityType: "assumption" }, { entityId: "commitguard:foreign:2026-10-20" },
  ]
  for (const [index, patch] of invalid.entries()) test(`invalid or irrelevant newest row ${index} cannot hide a valid correction`, () => {
    const result = assemble([override({ id: "older", updatedAt: date("2026-10-18") }),
      override({ id: "newest", updatedAt: date("2026-10-19"), ...patch })])
    assert.equal(fact(result).amountCents, 8000)
    assert.equal(fact(result).appliedOverrideId, "older")
  })
  test("tie precedence is updatedAt then id, independent of supplied order or duplicate target rows", () => {
    const a = override({ id: "a", amountCents: 7000 })
    const z = override({ id: "z", amountCents: 9000 })
    for (const rows of [[a, z, z], [z, a]]) {
      const result = assemble(rows)
      assert.equal(result.bundle.outflows.length, 1)
      assert.equal(fact(result).amountCents, 9000)
      assert.equal(fact(result).appliedOverrideId, "z")
    }
  })
  test("null amount is date-only, never fabricated zero", () => {
    const result = assemble([override({ amountCents: null, plannedDate: date("2026-11-03") })])
    assert.equal(fact(result).amountCents, 10_000)
    assert.equal(result.forecast?.weeks[2].outflowCents, 10_000)
  })
  for (const patch of [{ amountCents: 0 }, { plannedDate: date("2027-01-18") }, { plannedDate: date("2026-10-18") },
    { amountCents: 5000 }]) test(`bill inclusion/amount override ${JSON.stringify(patch)} cannot erase residual`, () => {
    const result = assemble([override({ entityId: "imported_bill:b-a", amountCents: null, ...patch })], true)
    assert.equal(fact(result).amountCents, 10_000)
    assert.deepEqual(result.coverage, [])
    assert.ok(result.quality.reasons.includes("coverage_review"))
    const retained = result.facts.find((row) => row.id === "imported_bill:b-a")!
    assert.deepEqual(retained.coverageIds, ["link"])
    assert.equal(retained.sourceId, "connection:xero:source")
    if (patch.amountCents !== 5000) {
      assert.equal(retained.included, false)
      assert.equal(result.bundle.outflows.length, 1)
      assert.equal(result.forecast?.weeks[0].outflowCents, 10_000)
    }
  })
  test("included corrected bill still subtracts only actual coverage once", () => {
    const result = assemble([override({ entityId: "imported_bill:b-a", amountCents: 7000 })], true)
    assert.equal(fact(result).amountCents, 4000)
    assert.equal(result.coverage.length, 1)
    assert.equal(result.forecast?.weeks[0].outflowCents, 11_000)
  })
  test("commitment override applies to gross occurrence before capped bill allocation", () => {
    const result = assemble([override()], true)
    assert.equal(fact(result).amountCents, 2000)
    assert.equal(result.forecast?.weeks[0].outflowCents, 8000)
  })
  test("explicit zero excludes target while retaining its identity", () => {
    const result = assemble([override({ amountCents: 0 })])
    assert.equal(fact(result).included, false)
    assert.equal(result.bundle.outflows.length, 0)
    assert.equal(result.forecast?.weeks[0].closingCashCents, 100_000)
  })
  test("unknown non-manual rows and generic generated IDs are not financial sources", () => {
    const result = assemble([override({ sourceType: "generated", entityId: "generated-forecast-4" }),
      override({ sourceType: "provider", entityId: "invoice:foreign" })])
    assert.equal(result.facts.length, 1)
    assert.ok(result.quality.reasons.includes("override_review"))
  })
  test("manual explicit dates create inflows/outflows; old week-like IDs never supply timing", () => {
    const result = assemble([override({ id: "manual", entityId: "opaque-12", entityType: "inflow",
      amountCents: 5000, plannedDate: date("2026-11-03") }),
      override({ id: "legacy", entityId: "manual-plan-outflow-9", amountCents: 30_000 })])
    assert.equal(result.plannedItems.find((row) => row.id === "legacy")?.state, "timing_review")
    assert.equal(result.plannedItems.find((row) => row.id === "legacy")?.plannedDate, null)
    assert.equal(result.forecast?.weeks[2].inflowCents, 5000)
    assert.equal(result.bundle.outflows.length, 1)
    assert.ok(result.quality.reasons.includes("timing_review"))
    assert.equal(result.forecast?.status, "preliminary")
  })
  test("manual past/exclusive-end dates stay visible outside the forecast; final day is included", () => {
    for (const [due, state] of [["2026-10-18", "outside_window"], ["2027-01-18", "outside_window"],
      ["2027-01-17", "scheduled"]] as const) {
      const result = assemble([override({ entityId: "planned", plannedDate: date(due) })])
      assert.equal(result.plannedItems[0].state, state)
      assert.equal(result.bundle.outflows.length, state === "scheduled" ? 2 : 1)
    }
  })
  test("legacy null amount remains unknown and visible, never zero", () => {
    const result = assemble([override({ entityId: "legacy", amountCents: null })])
    assert.equal(result.plannedItems[0].amountCents, null)
    assert.equal(result.plannedItems[0].state, "timing_review")
    assert.equal(result.facts.length, 1)
  })
  test("typed tuple keys avoid delimiter collisions and manual kinds have distinct fact identities", () => {
    const result = applyCashPlanOverrides({ planId: "plan-a", now, anchor: inputs.anchor!, targets: [], overrides: [
      override({ id: "a", entityType: "inflow", entityId: "x:outflow:y", plannedDate: date("2026-10-20") }),
      override({ id: "b", entityType: "outflow", entityId: "x:outflow:y", plannedDate: date("2026-10-20") }),
    ] })
    assert.equal(result.manual.length, 2)
    assert.notEqual(result.manual[0].id, result.manual[1].id)
  })
})