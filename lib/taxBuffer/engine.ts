export type TaxBufferAccountingBasis = "cash" | "accrual"
export type TaxBufferHealthStatus = "healthy" | "watch" | "underfunded" | "critical" | "unknown"
export type TaxBufferConfidence = "high" | "medium" | "low" | "unknown"

export type TaxReserveCategoryType =
  | "gst"
  | "payg_withholding"
  | "payg_instalment"
  | "income_tax"
  | "custom"

export type TaxReserveCalculationMethod =
  | "integration"
  | "fixed_amount"
  | "percentage_profit"
  | "percentage_revenue"
  | "manual"

export interface TaxReserveCategoryConfig {
  id: string
  type: TaxReserveCategoryType
  name: string
  enabled: boolean
  method: TaxReserveCalculationMethod
  ratePercent?: number | null
  fixedAmountCents?: number | null
  manualAmountCents?: number | null
  recurrence?: "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually" | "one_off"
  sourcePreference?: string | null
}

export interface TaxBufferMetricsInput {
  availableCashCents: number | null
  committedOutflowsCents: number
  estimatedRevenueCents: number
  estimatedTaxableProfitCents: number
  gstCollectedCents: number
  gstCreditCents: number
  unpaidInvoiceGstCents: number
  paygWithholdingCents?: number
  paygInstalmentCents?: number
}

export interface TaxBufferThresholds {
  watchRatio: number
  criticalRatio: number
}

export interface TaxBufferCategoryResult {
  categoryId: string
  type: TaxReserveCategoryType
  name: string
  requiredReserveCents: number
  reservedCents: number
  shortfallCents: number
  confidence: TaxBufferConfidence
  source: string
  explainability: string[]
}

export interface TaxBufferRecommendation {
  transferNowCents: number
  weeklyTargetCents: number
  reasons: string[]
}

export interface TaxBufferSummary {
  accountingBasis: TaxBufferAccountingBasis
  availableCashCents: number | null
  committedOutflowsCents: number
  totalRequiredReserveCents: number
  totalReservedCents: number
  reserveGapCents: number
  safeToSpendCents: number | null
  healthStatus: TaxBufferHealthStatus
  warnings: string[]
  categories: TaxBufferCategoryResult[]
  recommendation: TaxBufferRecommendation
}

export interface TaxBufferDigestSummaryInput {
  period: "daily" | "weekly"
  userName?: string
  transferNowCents?: number
  events: Array<{
    id: string
    title: string
    message: string
    severity: "critical" | "warning" | "watch" | "info"
    status?: string
  }>
}

export interface TaxBufferDigestSummary {
  period: "daily" | "weekly"
  count: number
  headline: string
  items: Array<{
    id: string
    title: string
    description: string
    severity: "critical" | "warning" | "watch" | "info"
  }>
  actions: string[]
}

function roundCents(value: number): number {
  return Math.max(0, Math.round(value))
}

function recurrenceFactor(recurrence: TaxReserveCategoryConfig["recurrence"]): number {
  switch (recurrence) {
    case "weekly":
      return 1
    case "fortnightly":
      return 0.5
    case "monthly":
      return 1 / 4.345
    case "quarterly":
      return 1 / 13
    case "annually":
      return 1 / 52
    case "one_off":
      return 1 / 8
    default:
      return 1 / 13
  }
}

export function evaluateTaxBufferHealth(input: {
  requiredReserveCents: number
  reservedCents: number
  thresholds: TaxBufferThresholds
}): TaxBufferHealthStatus {
  if (input.requiredReserveCents <= 0) return "unknown"
  const ratio = input.reservedCents / input.requiredReserveCents

  if (ratio >= 1) return "healthy"
  if (ratio >= input.thresholds.watchRatio) return "watch"
  if (ratio >= input.thresholds.criticalRatio) return "underfunded"
  return "critical"
}

export function computeTaxReserveCategory(input: {
  category: TaxReserveCategoryConfig
  accountingBasis: TaxBufferAccountingBasis
  metrics: TaxBufferMetricsInput
  reservedCents: number
}): TaxBufferCategoryResult {
  const { category, accountingBasis, metrics } = input
  const explainability: string[] = []
  let requiredReserveCents = 0
  let confidence: TaxBufferConfidence = "medium"
  let source = "calculated"

  if (!category.enabled) {
    return {
      categoryId: category.id,
      type: category.type,
      name: category.name,
      requiredReserveCents: 0,
      reservedCents: input.reservedCents,
      shortfallCents: 0,
      confidence: "unknown",
      source: "disabled",
      explainability: ["Category is disabled in Tax Buffer settings"],
    }
  }

  if (category.type === "gst" && category.method === "integration") {
    const collected = metrics.gstCollectedCents
    const credits = metrics.gstCreditCents
    const accrualAdjustment = accountingBasis === "accrual" ? metrics.unpaidInvoiceGstCents : 0
    requiredReserveCents = roundCents(collected - credits + accrualAdjustment)
    source = "integration"
    confidence = collected > 0 ? "high" : "low"
    explainability.push(`GST collected: ${collected}`)
    explainability.push(`GST credits: ${credits}`)
    if (accountingBasis === "accrual") {
      explainability.push(`Accrual adjustment from unpaid invoices: ${accrualAdjustment}`)
    }
  } else {
    switch (category.method) {
      case "fixed_amount": {
        requiredReserveCents = roundCents(category.fixedAmountCents ?? 0)
        source = "fixed_amount"
        explainability.push(`Fixed amount: ${requiredReserveCents}`)
        break
      }
      case "percentage_profit": {
        const rate = Math.max(0, category.ratePercent ?? 0)
        requiredReserveCents = roundCents((metrics.estimatedTaxableProfitCents * rate) / 100)
        source = "percentage_profit"
        explainability.push(`Rate ${rate}% of taxable profit ${metrics.estimatedTaxableProfitCents}`)
        break
      }
      case "percentage_revenue": {
        const rate = Math.max(0, category.ratePercent ?? 0)
        requiredReserveCents = roundCents((metrics.estimatedRevenueCents * rate) / 100)
        source = "percentage_revenue"
        explainability.push(`Rate ${rate}% of revenue ${metrics.estimatedRevenueCents}`)
        break
      }
      case "manual":
      case "integration":
      default: {
        requiredReserveCents = roundCents(category.manualAmountCents ?? 0)
        source = category.method === "integration" ? "fallback_manual" : "manual"
        confidence = category.method === "integration" ? "low" : "medium"
        explainability.push(`Manual estimate: ${requiredReserveCents}`)
        break
      }
    }

    if (category.type === "payg_withholding" && metrics.paygWithholdingCents) {
      requiredReserveCents = roundCents(metrics.paygWithholdingCents)
      source = "integration"
      confidence = "medium"
      explainability.push("Using available PAYG withholding source value")
    }

    if (category.type === "payg_instalment" && metrics.paygInstalmentCents) {
      requiredReserveCents = roundCents(metrics.paygInstalmentCents)
      source = "integration"
      confidence = "medium"
      explainability.push("Using available PAYG instalment source value")
    }
  }

  const shortfallCents = Math.max(0, requiredReserveCents - input.reservedCents)
  return {
    categoryId: category.id,
    type: category.type,
    name: category.name,
    requiredReserveCents,
    reservedCents: roundCents(input.reservedCents),
    shortfallCents,
    confidence,
    source,
    explainability,
  }
}

export function buildTaxBufferSummary(input: {
  accountingBasis: TaxBufferAccountingBasis
  thresholds: TaxBufferThresholds
  metrics: TaxBufferMetricsInput
  categories: TaxReserveCategoryConfig[]
  reservedByCategory: Record<string, number>
}): TaxBufferSummary {
  const warnings: string[] = []

  const categoryResults = input.categories.map((category) =>
    computeTaxReserveCategory({
      category,
      accountingBasis: input.accountingBasis,
      metrics: input.metrics,
      reservedCents: input.reservedByCategory[category.id] ?? 0,
    }),
  )

  const totalRequiredReserveCents = categoryResults.reduce(
    (sum, category) => sum + category.requiredReserveCents,
    0,
  )
  const totalReservedCents = categoryResults.reduce(
    (sum, category) => sum + category.reservedCents,
    0,
  )
  const reserveGapCents = Math.max(0, totalRequiredReserveCents - totalReservedCents)

  const safeToSpendCents =
    input.metrics.availableCashCents === null
      ? null
      : input.metrics.availableCashCents - totalRequiredReserveCents - input.metrics.committedOutflowsCents

  const healthStatus = evaluateTaxBufferHealth({
    requiredReserveCents: totalRequiredReserveCents,
    reservedCents: totalReservedCents,
    thresholds: input.thresholds,
  })

  if (input.metrics.availableCashCents === null) {
    warnings.push("Available cash is missing, safe-to-spend is an estimate")
  }

  const recommendationReasons = categoryResults
    .filter((category) => category.shortfallCents > 0)
    .sort((left, right) => right.shortfallCents - left.shortfallCents)
    .slice(0, 3)
    .map((category) => `${category.name} shortfall: ${category.shortfallCents}`)

  const weeklyTargetCents = roundCents(
    categoryResults.reduce((sum, category) => {
      const factor = recurrenceFactor(
        input.categories.find((item) => item.id === category.categoryId)?.recurrence,
      )
      return sum + category.requiredReserveCents * factor
    }, 0),
  )

  return {
    accountingBasis: input.accountingBasis,
    availableCashCents: input.metrics.availableCashCents,
    committedOutflowsCents: input.metrics.committedOutflowsCents,
    totalRequiredReserveCents,
    totalReservedCents,
    reserveGapCents,
    safeToSpendCents,
    healthStatus,
    warnings,
    categories: categoryResults,
    recommendation: {
      transferNowCents: reserveGapCents,
      weeklyTargetCents,
      reasons: recommendationReasons,
    },
  }
}

export function buildTaxBufferDigestSummary(input: TaxBufferDigestSummaryInput): TaxBufferDigestSummary {
  const actionable = input.events.filter((event) => (event.status ?? "open") !== "resolved")
  const ownerLabel = input.userName ? `${input.userName}'s` : "Your"
  const headline = `${ownerLabel} ${input.period} Tax Buffer summary: ${actionable.length} ${actionable.length === 1 ? "item needs attention" : "items need attention"}.`

  const actions = [
    input.transferNowCents && input.transferNowCents > 0
      ? `Transfer ${input.transferNowCents} into your reserve to close the current gap.`
      : null,
    actionable.some((event) => event.severity === "critical")
      ? "Prioritize critical reserve events first to reduce immediate tax risk."
      : null,
  ].filter((action): action is string => action !== null)

  return {
    period: input.period,
    count: actionable.length,
    headline,
    items: actionable.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.message,
      severity: event.severity,
    })),
    actions,
  }
}
