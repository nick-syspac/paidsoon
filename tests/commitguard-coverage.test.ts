import assert from "node:assert/strict"
import { test } from "node:test"
import { CoverageInputSchema, explicitBillUnpaidCents, inspectCoverage, reconcileCommitGuardCoverage,
  type CoverageCommitment, type CoverageRecord, type CoverageSources } from "@/lib/commitguard/coverage"

const start = new Date("2026-10-19Z")
const end = new Date("2026-11-18Z")
const commitment = (id = "c", amountCents = 10000): CoverageCommitment => ({ id, userId: "a", name: "Synthetic",
  category: "tax", amountCents, currency: "aud", frequency: "one_off", confidence: "confirmed", status: "active",
  archivedAt: null, nextDueDate: start, startDate: null, endDate: null })
const coverage = (id = "link", commitmentId = "c", coveredCents = 10000): CoverageRecord => ({
  id, userId: "a", commitmentId, occurrenceDate: start, currency: "aud", coveredCents,
  targetKind: "tax_reserve_category", importedBillId: null, taxReserveCategoryId: "tax",
})
const sources = (): CoverageSources => ({ userId: "a", taxApplicable: true, commitments: [commitment()], bills: [],
  taxCategories: [{ id: "tax", userId: "a", enabled: true, currency: "aud", requiredReserveCents: 12000 }] })
const reconcile = (source: CoverageSources, coverages: CoverageRecord[]) =>
  reconcileCommitGuardCoverage({ ...source, coverages, windowStart: start, windowEnd: end })

test("R=12000/C=10000 protects 12000 without mutating the commitment total", () => {
  const source = sources()
  const result = reconcile(source, [coverage()])
  assert.equal(result.quality.state, "complete")
  assert.deepEqual(result.groups[0], { currency: "aud", committedCents: 10000, additionalTaxReserveCents: 2000,
    overlapAdjustmentCents: 10000, combinedProtectionCents: 12000,
    categories: [{ categoryId: "tax", requiredReserveCents: 12000, coveredCents: 10000, protectedCents: 12000 }] })
  assert.equal(source.commitments[0].amountCents, 10000)
})

test("aggregate C=12000 and C=15000 use one max comparison, never a per-occurrence reserve or category cap", () => {
  for (const amount of [6000, 7500]) {
    const source = { ...sources(), commitments: [commitment("one", amount), commitment("two", amount)] }
    const result = reconcile(source, [coverage("first", "one", amount), coverage("second", "two", amount)])
    assert.equal(result.quality.state, "complete")
    assert.equal(result.groups[0].committedCents, amount * 2)
    assert.equal(result.groups[0].combinedProtectionCents, amount * 2)
    assert.equal(result.groups[0].categories[0].coveredCents, amount * 2)
  }
})

test("partial coverage retains uncovered commitments and unrelated reserves", () => {
  const source = sources()
  source.commitments = [commitment("c", 20000)]
  source.taxCategories = [...source.taxCategories, { id: "other", userId: "a", enabled: true, currency: "aud", requiredReserveCents: 3000 }]
  assert.equal(reconcile(source, [coverage()]).groups[0].combinedProtectionCents, 25000)
})

test("bill and category portions are disjoint; explicit bill tax attribution is reconciled once", () => {
  const source = sources()
  source.bills = [{ id: "bill", userId: "a", currency: "aud", unpaidCents: 6000, taxCategoryId: "tax" }]
  const billLink = { ...coverage("bill-link", "c", 6000), targetKind: "imported_bill", importedBillId: "bill", taxReserveCategoryId: null }
  const links = [billLink, coverage("tax-link", "c", 4000)]
  const result = reconcile(source, links)
  assert.equal(result.quality.state, "complete")
  assert.equal(result.groups[0].categories[0].coveredCents, 10000)
  assert.equal(result.groups[0].combinedProtectionCents, 12000)
  assert.equal(result.groups[0].committedCents, 10000, "bill links never remove cash movements here")
  const rejected = inspectCoverage(source, [billLink, coverage("tax-link", "c", 5000)])
  assert.equal(rejected.valid.length, 0)
  assert.ok(rejected.reviews.every((row) => row.reason === "coverage_occurrence_cap"))
})

test("bill tax attribution is not guessed and no stale target produces an overlap effect", () => {
  for (const change of ["disabled", "deleted", "foreign", "currency", "settled", "paid", "missing-balance", "attribution"]) {
    const source = sources()
    const tax = source.taxCategories[0]
    const link = coverage()
    if (change === "disabled") tax.enabled = false
    if (change === "deleted") source.taxCategories = []
    if (change === "foreign") tax.userId = "b"
    if (change === "currency") tax.currency = "usd"
    if (["settled", "paid", "missing-balance", "attribution"].includes(change)) {
      source.bills = [{ id: "bill", userId: "a", currency: "aud", unpaidCents: change === "paid" ? 0 : change === "missing-balance" ? null : 10000,
        taxCategoryId: null }]
      link.targetKind = "imported_bill"; link.importedBillId = "bill"; link.taxReserveCategoryId = null
    }
    const result = reconcile(source, [link])
    assert.equal(result.quality.state, "incomplete", change)
    assert.equal(result.groups.find((row) => row.currency === "aud")?.committedCents, 10000, change)
    assert.equal(result.groups.reduce((sum, row) => sum + row.overlapAdjustmentCents, 0), 0, change)
  }
})

test("exact UTC recurrence/date and live status are required, not a nearest occurrence", () => {
  for (const change of ["date", "paused", "archived", "frequency", "end", "amount", "unknown-frequency"]) {
    const source = sources()
    const c = source.commitments[0]
    if (change === "date") c.nextDueDate = new Date("2026-10-20Z")
    if (change === "paused") c.status = "paused"
    if (change === "archived") c.archivedAt = start
    if (change === "frequency") c.frequency = "custom"
    if (change === "unknown-frequency") c.frequency = "typo"
    if (change === "end") c.endDate = new Date("2026-10-18Z")
    if (change === "amount") c.amountCents = 9000
    const result = reconcile(source, [coverage()])
    assert.equal(result.quality.state, "incomplete", change)
    assert.equal(result.groups.reduce((sum, row) => sum + row.overlapAdjustmentCents, 0), 0, change)
  }
})

test("bill cap aggregates all dates and commitments, including allocations outside selected horizon", () => {
  const source = sources()
  source.commitments = [commitment(), { ...commitment("later"), nextDueDate: end }]
  source.bills = [{ id: "bill", userId: "a", currency: "aud", unpaidCents: 10000, taxCategoryId: "tax" }]
  const link = (id: string, c: string, date: Date) => ({ ...coverage(id, c, 6000), occurrenceDate: date,
    targetKind: "imported_bill", importedBillId: "bill", taxReserveCategoryId: null })
  const result = reconcile(source, [link("one", "c", start), link("two", "later", end)])
  assert.ok(result.quality.reviews.some((row) => row.reason === "coverage_bill_cap"))
  assert.equal(result.groups[0].overlapAdjustmentCents, 0)
})

test("currency partitions and half-open horizons never consolidate foreign cents", () => {
  const source = sources()
  source.commitments = [commitment(), { ...commitment("usd", 9000), category: "rent", currency: "usd" },
    { ...commitment("end", 999), category: "rent", nextDueDate: end }]
  assert.deepEqual(reconcile(source, [coverage()]).groups.map((row) => [row.currency, row.committedCents]), [["aud", 10000], ["usd", 9000]])
})

test("unlinked tax obligations require review only when tax protection is active", () => {
  assert.ok(reconcile(sources(), []).quality.reviews.some((row) => row.reason === "tax_overlap_review_required"))
  assert.equal(reconcile({ ...sources(), taxApplicable: false }, []).quality.state, "complete")
  assert.equal(inspectCoverage({ ...sources(), taxApplicable: false }, [coverage()]).valid.length, 0)
})

test("strict coverage boundary rejects unknown identity, invalid dates, cents, currency and ambiguous target", () => {
  const input = { commitmentId: "c", occurrenceDate: "2026-10-19", currency: "aud", coveredCents: 1,
    target: { kind: "tax_reserve_category", id: "tax" } }
  assert.ok(CoverageInputSchema.safeParse(input).success)
  for (const edit of [{ userId: "b" }, { occurrenceDate: "2026-02-30" }, { occurrenceDate: "2026-10-19T01:00:00Z" },
    { coveredCents: 0 }, { coveredCents: -1 }, { coveredCents: 1.5 }, { coveredCents: 2147483648 },
    { currency: "jpy" }, { target: { kind: "imported_bill", id: "bill", taxReserveCategoryId: "tax" } }]) {
    assert.equal(CoverageInputSchema.safeParse({ ...input, ...edit }).success, false)
  }
})

test("explicit source balances handle partial payments but never infer unpaid amount from total/open status", () => {
  const bill = { status: "open", paidDate: null, amountCents: 10000, provider: "xero", rawSourceData: { AmountDue: 60 } }
  assert.equal(explicitBillUnpaidCents(bill), 6000)
  assert.equal(explicitBillUnpaidCents({ ...bill, provider: "myob", rawSourceData: { BalanceDue: 60 } }), 6000)
  for (const edit of [{ rawSourceData: {} }, { rawSourceData: { AmountDue: "60" } }, { rawSourceData: { AmountDue: 101 } },
    { rawSourceData: { AmountDue: 0.001 } }, { rawSourceData: { AmountDue: 0 } }, { status: "paid" },
    { paidDate: start }, { provider: "unknown" }, { status: "voided" }]) {
    assert.equal(explicitBillUnpaidCents({ ...bill, ...edit }), null)
  }
})