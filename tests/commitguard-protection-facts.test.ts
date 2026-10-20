import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { buildCommitGuardProtectionFacts, type CommitGuardTaxCategoryInput,
  type CommitGuardTaxInvoiceInput, type CommitGuardTaxBillInput } from "@/lib/commitguard/protectionFacts"
import { computeTaxReserveCategory } from "@/lib/taxBuffer/engine"

const now = new Date("2026-10-19T12:00:00Z")
const category: CommitGuardTaxCategoryInput = {
  id: "tax-category", categoryType: "custom", name: "Reserve", enabled: true,
  calculationMethod: "fixed_amount", fixedAmountCents: 12_000, manualAmountCents: null,
  ratePercent: null, updatedAt: new Date("2026-10-10T00:00:00Z"),
}
const invoice: CommitGuardTaxInvoiceInput = { id: "invoice", amountDueCents: 110_000,
  currency: "aud", dueDate: new Date("2026-10-20T00:00:00Z"), syncedAt: now, sourceUpdatedAt: null }
const bill: CommitGuardTaxBillInput = { id: "bill", amountCents: 22_000, gstCents: 2_000,
  currency: "aud", syncedAt: now, sourceUpdatedAt: new Date("2026-10-17T09:00:00Z") }
const base = { entitled: true, configuration: { enabled: true, accountingBasis: "cash" },
  taxProtectionCurrency: "aud", categories: [category], overrides: [],
  financialInvoices: [], importedBills: [], now }
const override = { reserveCategoryId: category.id, obligationId: null, overrideValueCents: 15_000,
  reason: "Reviewed", createdBy: null, createdAt: now }

describe("CommitGuard pure D2 tax category facts", () => {
  test("protects the full required category amount, with stable target and source date", () => {
    const reservedCategory = computeTaxReserveCategory({
      category: { id: category.id, type: "custom", name: "Reserve", enabled: true,
        method: "fixed_amount", fixedAmountCents: 12_000 },
      accountingBasis: "cash", reservedCents: 5_000,
      metrics: { availableCashCents: null, committedOutflowsCents: 0, estimatedRevenueCents: 0,
        estimatedTaxableProfitCents: 0, gstCollectedCents: 0, gstCreditCents: 0, unpaidInvoiceGstCents: 0 },
    })
    assert.equal(reservedCategory.reservedCents, 5_000)
    assert.equal(reservedCategory.shortfallCents, 7_000)
    const facts = buildCommitGuardProtectionFacts(base)
    assert.equal(facts.amountCents, reservedCategory.requiredReserveCents)
    assert.equal(facts.quality.state, "complete")
    assert.deepEqual(facts.categories[0], { categoryId: category.id, requiredReserveCents: 12_000,
      currency: "aud", source: "fixed_amount", confidence: "medium",
      categoryUpdatedAt: category.updatedAt.toISOString(), overrideCreatedAt: null, sources: [], reasons: [] })
    assert.equal("reservedCents" in facts.categories[0], false)
    assert.equal("shortfallCents" in facts.categories[0], false)
  })

  test("latest category override wins, including zero; obligation overrides do not replace categories", () => {
    for (const amount of [15_000, 0]) {
      const facts = buildCommitGuardProtectionFacts({ ...base, overrides: [
        { ...override, reserveCategoryId: null, obligationId: "obligation", overrideValueCents: 99_000 },
        { ...override, overrideValueCents: amount },
        { ...override, overrideValueCents: 50_000, createdAt: category.updatedAt },
      ] })
      assert.equal(facts.amountCents, amount)
      assert.equal(facts.categories[0].source, "manual_override")
      assert.equal(facts.categories[0].overrideCreatedAt, now.toISOString())
    }
  })

  test("override never enables disabled categories or disabled Tax Buffer", () => {
    const facts = buildCommitGuardProtectionFacts({ ...base,
      categories: [{ ...category, enabled: false }], overrides: [override], taxProtectionCurrency: null })
    assert.equal(facts.amountCents, 0)
    assert.equal(facts.quality.state, "complete")
    assert.deepEqual(facts.categories, [])
    const disabled = buildCommitGuardProtectionFacts({ ...base,
      configuration: { enabled: false, accountingBasis: "cash" }, overrides: [override] })
    assert.equal(disabled.amountCents, 0)
    assert.deepEqual(disabled.quality, { state: "not_applicable", reasons: ["not_applicable"] })
  })

  test("missing entitlement is not applicable, while entitled missing configuration/categories is incomplete", () => {
    assert.equal(buildCommitGuardProtectionFacts({ ...base, entitled: false,
      configuration: null }).quality.state, "not_applicable")
    for (const input of [{ ...base, configuration: null }, { ...base, categories: [] }]) {
      const facts = buildCommitGuardProtectionFacts(input)
      assert.equal(facts.quality.state, "incomplete")
      assert.equal(facts.amountCents, null)
    }
  })

  test("requires a tax attestation independently of any cash balance, even for a configured zero", () => {
    for (const amount of [12_000, 0]) {
      const facts = buildCommitGuardProtectionFacts({ ...base, taxProtectionCurrency: null,
        categories: [{ ...category, fixedAmountCents: amount }] })
      assert.equal(facts.amountCents, null)
      assert.ok(facts.quality.reasons.includes("tax_protection_currency_missing"))
    }
    assert.ok(buildCommitGuardProtectionFacts({ ...base,
      taxProtectionCurrency: "jpy" }).quality.reasons.includes("tax_protection_currency_unsupported"))
  })

  test("reuses GST cash/accrual estimates without reserve balance or CashPlan inputs", () => {
    const input = { ...base, categories: [{ ...category, categoryType: "gst", calculationMethod: "integration" }],
      financialInvoices: [invoice], importedBills: [bill] }
    assert.equal(buildCommitGuardProtectionFacts(input).amountCents, 8_000)
    const accrual = buildCommitGuardProtectionFacts({ ...input,
      configuration: { enabled: true, accountingBasis: "accrual" } })
    assert.equal(accrual.amountCents, 18_000)
    assert.deepEqual(accrual.categories[0].sources.map((source) => [source.kind, source.id, source.sourceAsOf]), [
      ["financial_invoice", "invoice", now.toISOString()],
      ["imported_bill", "bill", bill.sourceUpdatedAt!.toISOString()],
    ])
  })

  test("reuses percentage revenue and profit calculations with source lineage", () => {
    for (const [method, expected] of [["percentage_revenue", 27_500], ["percentage_profit", 22_000]] as const) {
      const facts = buildCommitGuardProtectionFacts({ ...base,
        categories: [{ ...category, calculationMethod: method, ratePercent: 25 }],
        financialInvoices: [invoice], importedBills: [bill] })
      assert.equal(facts.amountCents, expected)
    }
  })

  test("rejects mixed/contradictory currencies before summation, preserving source currencies", () => {
    const input = { ...base, categories: [{ ...category, calculationMethod: "percentage_profit", ratePercent: 25 }],
      financialInvoices: [invoice], importedBills: [{ ...bill, currency: "usd" }] }
    const mixed = buildCommitGuardProtectionFacts(input)
    assert.equal(mixed.amountCents, null)
    assert.equal(mixed.categories[0].requiredReserveCents, null)
    assert.ok(mixed.quality.reasons.includes("tax_source_currencies_mixed"))
    assert.ok(mixed.quality.reasons.includes("tax_source_currency_mismatch"))
    assert.deepEqual(mixed.categories[0].sources.map((source) => source.currency), ["aud", "usd"])
    const mismatch = buildCommitGuardProtectionFacts({ ...input, importedBills: [bill], taxProtectionCurrency: "usd" })
    assert.ok(mismatch.quality.reasons.includes("tax_source_currency_mismatch"))
  })

  test("source-dependent missing data and unknown source currency are incomplete, not zero", () => {
    const input = { ...base, categories: [{ ...category, calculationMethod: "percentage_revenue", ratePercent: 25 }] }
    assert.ok(buildCommitGuardProtectionFacts(input).quality.reasons.includes("tax_source_data_missing"))
    for (const [currency, reason] of [["", "tax_source_currency_missing"], ["jpy", "tax_source_currency_unsupported"]]) {
      const facts = buildCommitGuardProtectionFacts({ ...input, financialInvoices: [{ ...invoice, currency }] })
      assert.equal(facts.amountCents, null)
      assert.ok(facts.quality.reasons.includes(reason as typeof facts.quality.reasons[number]))
    }
  })

  test("a same-currency non-AUD percentage estimate is supported, but the legacy AUD GST estimator is not relabelled", () => {
    const input = { ...base, taxProtectionCurrency: "usd", financialInvoices: [{ ...invoice, currency: "usd" }] }
    assert.equal(buildCommitGuardProtectionFacts({ ...input,
      categories: [{ ...category, calculationMethod: "percentage_revenue", ratePercent: 10 }] }).amountCents, 11_000)
    const gst = buildCommitGuardProtectionFacts({ ...input,
      categories: [{ ...category, categoryType: "gst", calculationMethod: "integration" }] })
    assert.equal(gst.amountCents, null)
    assert.ok(gst.quality.reasons.includes("tax_source_currency_unsupported"))
  })

  test("manual override replaces source calculation, not merely its reserve gap", () => {
    const facts = buildCommitGuardProtectionFacts({ ...base, overrides: [override],
      categories: [{ ...category, calculationMethod: "percentage_profit", ratePercent: 25 }],
      financialInvoices: [{ ...invoice, currency: "usd" }] })
    assert.equal(facts.amountCents, 15_000)
    assert.deepEqual(facts.categories[0].sources, [])
  })

  test("missing configured amounts and overflow cannot silently yield complete protection", () => {
    for (const row of [{ ...category, fixedAmountCents: null }, { ...category, fixedAmountCents: -1 },
      { ...category, calculationMethod: "manual", categoryType: "gst", manualAmountCents: -1 },
      { ...category, calculationMethod: "unknown" }]) {
      assert.equal(buildCommitGuardProtectionFacts({ ...base, categories: [row] }).amountCents, null)
    }
    const facts = buildCommitGuardProtectionFacts({ ...base, categories: [
      { ...category, fixedAmountCents: 2_147_483_647 }, { ...category, id: "another" },
    ] })
    assert.equal(facts.amountCents, null)
    assert.ok(facts.quality.reasons.includes("tax_amount_invalid"))
  })
})