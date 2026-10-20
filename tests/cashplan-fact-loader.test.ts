import assert from "node:assert/strict"
import { beforeEach, describe, mock, test } from "node:test"
import type { PrismaTx } from "@/lib/db/withUserContext"

const userId = "tenant-owner"
const now = new Date("2026-10-19T01:00:00Z")
const due = new Date("2026-10-20T00:00:00Z")
type Query = { where: Record<string, unknown>; select: Record<string, unknown>; orderBy?: unknown }
const calls: Array<{ table: string; query: Query }> = []
let transactions: Array<{ userId: string; options: unknown }> = []
let availablePlan = true
let enabled = true
let amountCents: number | null = 100_000
let paid = false
let provider = "xero"
let billCurrency = "aud"
let billDue: Date | null = due
let raw: unknown = { AmountDue: 60 }
let snapshot: unknown = null
let snapshotResult: unknown = null
let overrides: unknown[] = []

const read = (table: string, result: (query: Query) => unknown) => async (query: Query) => {
  calls.push({ table, query })
  if (table === "overrides") assert.deepEqual(query.where, { planId: "plan-a", plan: { userId } })
  else if (table === "snapshot") assert.deepEqual(query.where, { planId: "plan-a", plan: { userId }, scenarioId: null })
  else assert.equal(query.where.userId, userId)
  return result(query)
}
// Only the exact read operations are available. Any writes, other financial
// source adapters, admin access or independent transaction fail the test.
const tx = new Proxy({
  cashPlan: { findFirst: read("plan", () => availablePlan ? { id: "plan-a", name: "Plan", currency: "aud",
    timezone: "Australia/Sydney", horizonWeeks: 13, bufferTargetCents: 50_000, updatedAt: now } : null) },
  cashPlanSetting: { findFirst: read("plan-settings", () => null) },
  commitGuardCashContext: { findUnique: read("cash", () => amountCents === null ? null : { amountCents, currency: "aud",
    balanceAsOf: new Date("2026-10-19T00:00:00Z"), weeklyOperatingExpensesCents: null,
    weeklyExpensesCurrency: null, weeklyExpensesAsOf: null, taxProtectionCurrency: "aud", revision: 9 }) },
  commitGuardSetting: { findUnique: read("commit-settings", () => ({ enabled, calculationRevision: 7 })) },
  commitment: { findMany: read("commitments", () => [{ id: "commit-a", userId, name: "Commitment", category: "tax",
    amountCents: 10_000, currency: "aud", frequency: "one_off", confidence: "low", status: "active", archivedAt: null,
    nextDueDate: due, startDate: null, endDate: null, updatedAt: now }]) },
  commitmentCoverage: { findMany: read("coverage", () => [{ id: "coverage-a", userId, commitmentId: "commit-a", occurrenceDate: due,
    currency: "aud", coveredCents: 6000, targetKind: "imported_bill", importedBillId: "bill-a", taxReserveCategoryId: null }]) },
  importedBill: { findMany: read("bills", (query) => {
    assert.deepEqual(query.where, { userId, id: { in: ["bill-a"] } })
    for (const key of ["dueDate", "paidDate", "status", "rawSourceData", "accountingConnection", "sourceId", "accountingConnectionId"]) {
      assert.ok(query.select[key], `missing required persisted field: ${key}`)
    }
    return [{ id: "bill-a", userId, accountingConnectionId: "connection-a", sourceId: "provider-id", amountCents: 10_000,
      currency: billCurrency, dueDate: billDue, paidDate: paid ? now : null, status: paid ? "paid" : "open", rawSourceData: raw,
      sourceUpdatedAt: now, syncedAt: now, accountingConnection: { userId, provider } }]
  }) },
  cashPlanSnapshot: { findFirst: read("snapshot", () => snapshot) },
  cashPlanOverride: { findMany: read("overrides", () => overrides) },
}, { get(target, key, receiver) {
  assert.ok(key in target, `unexpected table: ${String(key)}`)
  return Reflect.get(target, key, receiver)
} })
mock.module("@/lib/db/withUserContext", { namedExports: {
  withUserContext: async (identity: string, callback: (tx: PrismaTx) => Promise<unknown>, options: unknown) => {
    transactions.push({ userId: identity, options })
    const result = await callback(tx as unknown as PrismaTx)
    snapshotResult = result
    return result
  },
} })
const { loadCashPlanFacts, loadCashPlanFactsInTransaction } = await import("@/lib/cashplan/factLoader")
const { cashPlanSnapshotFactsHash, cashPlanSnapshotFactsMetadata } = await import("@/lib/cashplan/factAssembler")
const load = (commitGuardEntitled = true) => loadCashPlanFacts(userId, { now, commitGuardEntitled })

beforeEach(() => {
  calls.length = 0
  transactions = []
  availablePlan = true
  enabled = true
  amountCents = 100_000
  paid = false
  provider = "xero"
  billCurrency = "aud"
  billDue = due
  raw = { AmountDue: 60 }
  snapshot = null
  snapshotResult = null
  overrides = []
})

describe("CashPlan 8.2 actual read-only tenant fact loader", () => {
  test("persisted override fields reach the real assembler and excluded bill restores residual", async () => {
    overrides = [{ id: "exclude", planId: "plan-a", entityType: "outflow", entityId: "imported_bill:bill-a",
      amountCents: 0, plannedDate: null, effectiveFrom: null, expiresAt: null, sourceType: "manual",
      sourceId: null, updatedAt: now }]
    const result = await load()
    assert.equal(result.facts.find((row) => row.sourceSystem === "commitguard")?.amountCents, 10_000)
    assert.equal(result.facts.find((row) => row.sourceSystem === "imported_bill")?.included, false)
    assert.equal(result.forecast?.weeks[0].outflowCents, 10_000)
    assert.deepEqual(result.coverage, [])
    const query = calls.find((row) => row.table === "overrides")!.query
    assert.deepEqual(query.orderBy, [{ updatedAt: "desc" }, { id: "desc" }])
    for (const field of ["plannedDate", "entityId", "entityType", "amountCents", "effectiveFrom", "expiresAt", "updatedAt", "planId"]) {
      assert.equal(query.select[field], true)
    }
  })
  test("loaded legacy planned rows remain visible with null timing and no guessed movement", async () => {
    overrides = [{ id: "legacy", planId: "plan-a", entityType: "inflow", entityId: "manual-plan-a-inflow-8",
      amountCents: 50_000, plannedDate: null, effectiveFrom: null, expiresAt: null,
      sourceType: "manual", sourceId: "opaque-week-8", updatedAt: now }]
    const result = await load()
    assert.equal(result.plannedItems[0].state, "timing_review")
    assert.equal(result.plannedItems[0].plannedDate, null)
    assert.equal(result.bundle.inflows.length, 0)
    assert.ok(result.forecast?.dataQualityIssues.some((row) => row.type === "timing_review"))
  })
  test("all plan/cash/CommitGuard/bill/snapshot reads share exactly one repeatable-read tenant transaction", async () => {
    const result = await load()
    assert.deepEqual(transactions, [{ userId, options: { isolationLevel: "RepeatableRead" } }])
    assert.deepEqual(calls.map((row) => row.table), ["plan", "plan-settings", "plan-settings", "cash",
      "commit-settings", "commitments", "coverage", "snapshot", "overrides", "bills"])
    assert.equal(result.facts[0].amountCents, 4000)
    assert.equal(result.facts[1].amountCents, 6000)
    assert.equal(result.forecast?.weeks[0].openingCashCents, 100_000)
    assert.equal(result.forecast?.weeks[0].closingCashCents, 90_000)
    assert.equal(result.facts[1].sourceId, "connection-a:xero:provider-id")
    assert.equal(snapshotResult, result)
    assert.equal(JSON.stringify(result).includes(userId), false)
    assert.deepEqual(calls.find((row) => row.table === "snapshot")?.query.orderBy,
      [{ createdAt: "desc" }, { id: "desc" }])
  })
  test("caller transaction variant reuses its RLS snapshot without nested contexts", async () => {
    const result = await loadCashPlanFactsInTransaction(tx as unknown as PrismaTx, userId, { now, commitGuardEntitled: true })
    assert.equal(result.facts.length, 2)
    assert.deepEqual(transactions, [])
  })
  test("requested missing plan returns 404 before reading financial sources", async () => {
    availablePlan = false
    await assert.rejects(loadCashPlanFacts(userId, { now, planId: "foreign", commitGuardEntitled: true }), { message: "Not found" })
    assert.deepEqual(calls.map((row) => row.table), ["plan"])
    assert.deepEqual(calls[0].query.where, { userId, id: "foreign" })
  })
  test("no existing plan does not fabricate defaults or read snapshots", async () => {
    availablePlan = false
    const result = await load()
    assert.equal(result.forecast, null)
    assert.deepEqual(result.facts, [])
    assert.deepEqual(calls.map((row) => row.table), ["plan", "cash"])
  })
  for (const entitled of [true, false]) test(`disabled/no-access contribution (${entitled}) does not load commitments, coverage or bills`, async () => {
    enabled = !entitled
    const result = await load(entitled)
    assert.deepEqual(result.facts, [])
    assert.ok(!calls.some((row) => ["commitments", "coverage", "bills"].includes(row.table)))
    assert.ok(result.quality.reasons.includes("commitguard_disabled"))
  })
  test("paid state from actual selected fields retains full commitment residual", async () => {
    paid = true
    const result = await load()
    assert.equal(result.facts[0].amountCents, 10_000)
    assert.equal(result.facts.length, 1)
    assert.ok(result.quality.reasons.includes("coverage_review"))
  })
  test("absent persisted explicit balance is not replaced by imported bill total", async () => {
    raw = {}
    const result = await load()
    assert.equal(result.facts[0].amountCents, 10_000)
    assert.equal(result.facts.length, 1)
  })
  for (const variant of ["currency", "outwindow", "provider", "missingdate"]) test(`actual loaded ${variant} bill cannot deduct`, async () => {
    if (variant === "currency") billCurrency = "usd"
    if (variant === "outwindow") billDue = new Date("2027-01-18T00:00:00Z")
    if (variant === "provider") provider = "Xero"
    if (variant === "missingdate") billDue = null
    const result = await load()
    assert.equal(result.facts[0].amountCents, 10_000)
    assert.equal(result.coverage.length, 0)
  })
  test("missing cash retains reconstructable facts but no asserted cash amounts", async () => {
    amountCents = null
    const result = await load()
    assert.equal(result.facts.length, 2)
    assert.equal(result.forecast, null)
    assert.equal(result.quality.state, "unavailable")
  })
  for (const amount of [0, -100]) test(`actual signed cash ${amount} is not replaced by free cash or reserves`, async () => {
    amountCents = amount
    assert.equal((await load()).forecast?.weeks[0].openingCashCents, amount)
  })
  test("actual selected v2 snapshot validates lineage and never uses weekly totals", async () => {
    const first = await load()
    const canonicalFacts = cashPlanSnapshotFactsMetadata(first.inputs, first.facts)
    const inputQuality = first.quality
    snapshot = { id: "v2", planId: "plan-a", scenarioId: null, inputVersion: 2,
      anchorDate: new Date("2026-10-19T00:00:00Z"), inputCurrency: "aud", cashInputRevision: 9,
      commitmentRevision: 7, canonicalFacts, coverage: first.coverage, inputQuality,
      inputHash: cashPlanSnapshotFactsHash({ planId: "plan-a", anchorDate: "2026-10-19", currency: "aud",
        cashInputRevision: 9, commitmentRevision: 7, canonicalFacts, coverage: first.coverage, inputQuality }) }
    const result = await load()
    assert.equal(result.reusedSnapshotId, "v2")
    assert.equal(result.forecast?.weeks[0].outflowCents, 10_000)
    assert.equal(calls.filter((row) => row.table === "snapshot").every((row) => !("weeks" in row.query.select)), true)
    paid = true
    const afterPayment = await load()
    assert.equal(afterPayment.reusedSnapshotId, null)
    assert.equal(afterPayment.facts[0].amountCents, 10_000)
    assert.ok(afterPayment.quality.reasons.includes("snapshot_lineage_review"))
  })
  test("legacy snapshot remains history and repeat reads never persist forecast/defaults/events", async () => {
    snapshot = { id: "old", inputVersion: 1 }
    const first = await load()
    const second = await load()
    assert.deepEqual(first, second)
    assert.equal(first.reusedSnapshotId, null)
    assert.ok(first.quality.reasons.includes("legacy_snapshot_review"))
  })
})