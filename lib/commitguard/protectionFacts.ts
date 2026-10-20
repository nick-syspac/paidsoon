import { z } from "zod"
import { CommitGuardCurrencySchema } from "@/lib/commitguard/cashContext"
import { buildLatestOverrideMaps, estimateGstFromInvoiceAmount,
  type TaxBufferOverrideInput } from "@/lib/taxBuffer/categoryInputs"
import { computeTaxReserveCategory, type TaxBufferCategoryResult } from "@/lib/taxBuffer/engine"
import type { TaxReserveCategory } from "@/lib/generated/prisma/client"

export type CommitGuardTaxProtectionReason =
  | "not_applicable" | "tax_configuration_missing" | "tax_categories_missing"
  | "tax_category_configuration_invalid" | "tax_source_data_missing"
  | "tax_protection_currency_missing" | "tax_protection_currency_unsupported"
  | "tax_source_currency_missing" | "tax_source_currency_unsupported"
  | "tax_source_currencies_mixed" | "tax_source_currency_mismatch" | "tax_amount_invalid"

export interface CommitGuardTaxSource {
  kind: "financial_invoice" | "imported_bill"
  id: string
  currency: string
  sourceAsOf: string
}

export interface CommitGuardTaxCategoryFact {
  // Existing category identity, suitable for coverage targets; never a generated obligation.
  categoryId: string
  requiredReserveCents: number | null
  currency: string | null
  source: string
  confidence: TaxBufferCategoryResult["confidence"]
  categoryUpdatedAt: string
  overrideCreatedAt: string | null
  sources: CommitGuardTaxSource[]
  reasons: CommitGuardTaxProtectionReason[]
}

export interface CommitGuardProtectionFacts {
  asOf: string
  applicable: boolean
  amountCents: number | null
  currency: string | null
  categories: CommitGuardTaxCategoryFact[]
  quality: {
    state: "complete" | "incomplete" | "not_applicable"
    reasons: CommitGuardTaxProtectionReason[]
  }
}

export type CommitGuardTaxCategoryInput = Pick<TaxReserveCategory,
  "id" | "categoryType" | "name" | "enabled" | "calculationMethod" | "ratePercent" |
  "fixedAmountCents" | "manualAmountCents" | "updatedAt">

export interface CommitGuardTaxInvoiceInput {
  id: string
  amountDueCents: number
  currency: string
  dueDate: Date
  syncedAt: Date
  sourceUpdatedAt: Date | null
}

export interface CommitGuardTaxBillInput {
  id: string
  amountCents: number
  gstCents: number | null
  currency: string
  syncedAt: Date
  sourceUpdatedAt: Date | null
}

const categoryTypeSchema = z.enum(["gst", "payg_withholding", "payg_instalment", "income_tax", "custom"])
const methodSchema = z.enum(["integration", "fixed_amount", "percentage_profit", "percentage_revenue", "manual"])
const validCents = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 2_147_483_647

/** Pure D2 category projection, not a free-cash summary or overlap reconciliation.
 * Reuses Tax Buffer's existing estimates; no new periods, payment rules, or FX.
 * Missing configuration/currency never becomes a zero reserve. An override does
 * not reactivate a disabled category. Source timestamps are not cash freshness.
 */
export function buildCommitGuardProtectionFacts(input: {
  entitled: boolean
  configuration: { enabled: boolean; accountingBasis: string } | null
  taxProtectionCurrency: string | null
  categories: readonly CommitGuardTaxCategoryInput[]
  overrides: readonly TaxBufferOverrideInput[] // newest createdAt first (stable id tie-break at load)
  financialInvoices: readonly CommitGuardTaxInvoiceInput[]
  importedBills: readonly CommitGuardTaxBillInput[]
  now: Date
}): CommitGuardProtectionFacts {
  const base = { asOf: input.now.toISOString(), currency: input.taxProtectionCurrency }
  if (!input.entitled || input.configuration?.enabled === false) {
    return { ...base, applicable: false, amountCents: 0, currency: null, categories: [],
      quality: { state: "not_applicable", reasons: ["not_applicable"] } }
  }
  const reasons: CommitGuardTaxProtectionReason[] = []
  if (input.configuration === null) reasons.push("tax_configuration_missing")
  if (input.categories.length === 0) reasons.push("tax_categories_missing")
  const enabled = input.categories.filter((category) => category.enabled)
  if (enabled.length > 0) {
    if (input.taxProtectionCurrency === null) reasons.push("tax_protection_currency_missing")
    else if (!CommitGuardCurrencySchema.safeParse(input.taxProtectionCurrency).success) {
      reasons.push("tax_protection_currency_unsupported")
    }
  }
  const { categoryOverrideById } = buildLatestOverrideMaps(input.overrides)
  const categories = enabled.map((category): CommitGuardTaxCategoryFact => {
    const categoryReasons: CommitGuardTaxProtectionReason[] = []
    const override = categoryOverrideById.get(category.id)
    const method = methodSchema.safeParse(override ? "manual" : category.calculationMethod)
    const type = categoryTypeSchema.safeParse(category.categoryType)
    const usesSources = !override && ["integration", "percentage_profit", "percentage_revenue"].includes(category.calculationMethod)
      && !(category.calculationMethod === "integration" && category.categoryType !== "gst")
    const invoices = usesSources ? input.financialInvoices : []
    const bills = usesSources && category.calculationMethod !== "percentage_revenue" ? input.importedBills : []
    const sources: CommitGuardTaxSource[] = [
      ...invoices.map((row): CommitGuardTaxSource => ({ kind: "financial_invoice", id: row.id,
        currency: row.currency.trim().toLowerCase(), sourceAsOf: (row.sourceUpdatedAt ?? row.syncedAt).toISOString() })),
      ...bills.map((row): CommitGuardTaxSource => ({ kind: "imported_bill", id: row.id,
        currency: row.currency.trim().toLowerCase(), sourceAsOf: (row.sourceUpdatedAt ?? row.syncedAt).toISOString() })),
    ]
    if (usesSources && sources.length === 0) categoryReasons.push("tax_source_data_missing")
    const currencies = new Set(sources.map((source) => source.currency))
    if (currencies.has("")) categoryReasons.push("tax_source_currency_missing")
    if ([...currencies].some((currency) => currency && !CommitGuardCurrencySchema.safeParse(currency).success)) {
      categoryReasons.push("tax_source_currency_unsupported")
    }
    if (currencies.size > 1) categoryReasons.push("tax_source_currencies_mixed")
    if (input.taxProtectionCurrency !== null && [...currencies].some((currency) => currency !== input.taxProtectionCurrency)) {
      categoryReasons.push("tax_source_currency_mismatch")
    }
    // The existing GST estimate is Australian (1/11, AUD invoices). An
    // attestation cannot turn that legacy estimator into another tax regime.
    if (!override && category.calculationMethod === "integration" && category.categoryType === "gst" &&
      [...currencies].some((currency) => currency !== "aud")) {
      categoryReasons.push("tax_source_currency_unsupported")
    }
    if (!method.success || !type.success || !input.configuration ||
      !["cash", "accrual"].includes(input.configuration.accountingBasis) ||
      method.data === "fixed_amount" && category.fixedAmountCents === null ||
      method.data === "manual" && (override?.overrideValueCents ?? category.manualAmountCents) === null ||
      method.data === "integration" && type.data !== "gst" && category.manualAmountCents === null ||
      method.data?.startsWith("percentage_") && category.ratePercent === null) {
      categoryReasons.push("tax_category_configuration_invalid")
    }
    let result: TaxBufferCategoryResult | null = null
    if (method.success && type.success && categoryReasons.length === 0) {
      // Preserve the existing Tax Buffer input formulas, independently of cash,
      // reserved balances, obligation gaps and CashPlan commitments.
      const revenue = invoices.reduce((sum, row) => sum + row.amountDueCents, 0)
      const costs = bills.reduce((sum, row) => sum + row.amountCents, 0)
      const gstCollected = invoices.filter((row) => row.currency.toLowerCase() === "aud")
        .reduce((sum, row) => sum + estimateGstFromInvoiceAmount(row.amountDueCents), 0)
      const gstCredit = bills.reduce((sum, row) => sum + (row.gstCents ?? 0), 0)
      const accrualGst = input.configuration?.accountingBasis === "accrual"
        ? invoices.filter((row) => row.dueDate >= input.now)
          .reduce((sum, row) => sum + estimateGstFromInvoiceAmount(row.amountDueCents), 0) : 0
      if (![revenue, costs, gstCollected, gstCredit, accrualGst].every(validCents) ||
        method.data === "fixed_amount" && !validCents(category.fixedAmountCents!) ||
        (method.data === "manual" || method.data === "integration" && type.data !== "gst") &&
          !validCents(override?.overrideValueCents ?? category.manualAmountCents!) ||
        invoices.some((row) => !validCents(row.amountDueCents)) ||
        bills.some((row) => !validCents(row.amountCents) || row.gstCents !== null && !validCents(row.gstCents)) ||
        method.data.startsWith("percentage_") && category.ratePercent !== null &&
          (!Number.isFinite(category.ratePercent) || category.ratePercent < 0)) {
        categoryReasons.push("tax_amount_invalid")
      } else {
        result = computeTaxReserveCategory({
          category: { id: category.id, type: type.data, name: category.name, enabled: true,
            method: method.data, ratePercent: category.ratePercent, fixedAmountCents: category.fixedAmountCents,
            manualAmountCents: override?.overrideValueCents ?? category.manualAmountCents },
          accountingBasis: input.configuration?.accountingBasis === "accrual" ? "accrual" : "cash",
          reservedCents: 0,
          metrics: { availableCashCents: null, committedOutflowsCents: 0,
            estimatedRevenueCents: revenue, estimatedTaxableProfitCents: Math.max(0, revenue - costs),
            gstCollectedCents: gstCollected, gstCreditCents: gstCredit, unpaidInvoiceGstCents: accrualGst },
        })
        // Legacy summary applies category overrides after calculation, including zero.
        const amount = override?.overrideValueCents ?? result.requiredReserveCents
        if (!validCents(amount)) categoryReasons.push("tax_amount_invalid")
        else result = { ...result, requiredReserveCents: amount, source: override ? "manual_override" : result.source }
      }
    }
    reasons.push(...categoryReasons)
    return { categoryId: category.id, requiredReserveCents: categoryReasons.length ? null : result?.requiredReserveCents ?? null,
      currency: input.taxProtectionCurrency, source: override ? "manual_override" : result?.source ?? "unknown",
      confidence: result?.confidence ?? "unknown", categoryUpdatedAt: category.updatedAt.toISOString(),
      overrideCreatedAt: override?.createdAt.toISOString() ?? null, sources, reasons: categoryReasons }
  })
  const amount = categories.reduce((sum, category) => sum + (category.requiredReserveCents ?? 0), 0)
  if (!validCents(amount)) reasons.push("tax_amount_invalid")
  const uniqueReasons = [...new Set(reasons)]
  return { ...base, applicable: true, amountCents: uniqueReasons.length ? null : amount, categories,
    quality: { state: uniqueReasons.length ? "incomplete" : "complete", reasons: uniqueReasons } }
}