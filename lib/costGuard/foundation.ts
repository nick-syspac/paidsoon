export const BASELINE_WINDOWS = [3, 6, 12] as const

export type BaselineWindow = (typeof BASELINE_WINDOWS)[number]

export interface BaselineCalculationInput {
  values: number[]
}

export interface BaselineCalculation {
  sampleCount: number
  averageCents: number
  medianCents: number
  confidence: number
  minCents: number
  maxCents: number
}

export interface MaterialityInput {
  actualCents: number
  baselineCents: number
  percentageThreshold: number
  absoluteThresholdCents: number
}

export interface MaterialityEvaluation {
  varianceAmountCents: number
  variancePercent: number
  passes: boolean
}

export interface ForecastInput {
  actualSpendCents: number
  recurringCommitmentsCents: number
  expectedVariableSpendCents: number
  baselineSpendCents?: number
}

export interface ForecastSummary {
  actualSpendCents: number
  recurringCommitmentsCents: number
  expectedVariableSpendCents: number
  projectedMonthEndCents: number
  varianceAmountCents: number
  variancePercent: number
  confidence: number
}

export interface CostGuardForecastSummary {
  projectedMonthEndCents: number
  varianceAmountCents: number
  variancePercent: number
  confidence: number
  status: "on_track" | "watch" | "over_target"
  message: string
}

export interface CostGuardRuleDefinition {
  id: string
  name: string
  ruleType:
    | "supplier_increase"
    | "category_increase"
    | "large_unusual_invoice"
    | "duplicate_spend"
    | "new_supplier"
    | "recurring_increase"
    | "forecast_overrun"
  severity: "info" | "watch" | "warning" | "critical"
  defaultPercentageThreshold: number
  defaultAbsoluteThresholdCents: number
  enabled: boolean
  description: string
}

export function calculateBaseline(values: number[]): BaselineCalculation {
  const sorted = [...values].sort((a, b) => a - b)
  const averageCents = values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
  const medianCents =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 0
        ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
        : sorted[Math.floor(sorted.length / 2)]

  const minCents = sorted.length > 0 ? sorted[0] : 0
  const maxCents = sorted.length > 0 ? sorted[sorted.length - 1] : 0
  const variance = values.length > 0 ? values.reduce((sum, value) => sum + (value - averageCents) ** 2, 0) / values.length : 0
  const stdDev = Math.sqrt(variance)
  const spreadRatio = maxCents > 0 ? (maxCents - minCents) / maxCents : 0
  const sampleStrength = Math.min(1, values.length / 12)
  const consistencyScore = Math.max(0, 1 - Math.min(1, stdDev / Math.max(averageCents, 1)))
  const confidence = Math.round((sampleStrength * 0.55 + consistencyScore * 0.45 + (1 - Math.min(1, spreadRatio)) * 0.2) * 100)

  return {
    sampleCount: values.length,
    averageCents,
    medianCents,
    confidence: Math.min(100, Math.max(0, confidence)),
    minCents,
    maxCents,
  }
}

export function evaluateMateriality({
  actualCents,
  baselineCents,
  percentageThreshold,
  absoluteThresholdCents,
}: MaterialityInput): MaterialityEvaluation {
  const varianceAmountCents = actualCents - baselineCents
  const variancePercent = baselineCents === 0 ? (actualCents === 0 ? 0 : 100) : (varianceAmountCents / baselineCents) * 100
  const passes = Math.abs(variancePercent) >= percentageThreshold && Math.abs(varianceAmountCents) >= absoluteThresholdCents

  return {
    varianceAmountCents,
    variancePercent,
    passes,
  }
}

export function calculateForecast({
  actualSpendCents,
  recurringCommitmentsCents,
  expectedVariableSpendCents,
  baselineSpendCents = 0,
}: ForecastInput): ForecastSummary {
  const projectedMonthEndCents =
    actualSpendCents + recurringCommitmentsCents + expectedVariableSpendCents
  const varianceAmountCents = projectedMonthEndCents - baselineSpendCents
  const variancePercent = baselineSpendCents === 0 ? 0 : (varianceAmountCents / baselineSpendCents) * 100
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(100 - Math.min(100, Math.abs(variancePercent) / 2)))
  )

  return {
    actualSpendCents,
    recurringCommitmentsCents,
    expectedVariableSpendCents,
    projectedMonthEndCents,
    varianceAmountCents,
    variancePercent,
    confidence,
  }
}

export function buildCostGuardForecastSummary(forecast: ForecastSummary): CostGuardForecastSummary {
  const absVariance = Math.abs(forecast.varianceAmountCents)
  const absPercent = Math.abs(forecast.variancePercent)

  let status: CostGuardForecastSummary["status"] = "on_track"
  let message = "Projected spend remains within the expected range."

  if (absVariance > 25000 || absPercent > 15) {
    status = "over_target"
    message = `Projected month-end spend is ${absVariance >= 0 ? "above" : "below"} the expected baseline by ${Math.abs(forecast.varianceAmountCents) / 100} AUD, which is ${Math.abs(forecast.variancePercent).toFixed(1)}% away from plan.`
  } else if (absVariance > 10000 || absPercent > 5) {
    status = "watch"
    message = `Projected month-end spend is close to the expected range and should be reviewed.`
  }

  return {
    projectedMonthEndCents: forecast.projectedMonthEndCents,
    varianceAmountCents: forecast.varianceAmountCents,
    variancePercent: forecast.variancePercent,
    confidence: forecast.confidence,
    status,
    message,
  }
}

export function buildDefaultCostGuardRules(): CostGuardRuleDefinition[] {
  return [
    {
      id: "supplier-increase-default",
      name: "Supplier increase",
      ruleType: "supplier_increase",
      severity: "warning",
      defaultPercentageThreshold: 20,
      defaultAbsoluteThresholdCents: 10000,
      enabled: true,
      description: "Alert when a supplier's spend exceeds the recent baseline by a material amount.",
    },
    {
      id: "category-increase-default",
      name: "Category increase",
      ruleType: "category_increase",
      severity: "warning",
      defaultPercentageThreshold: 25,
      defaultAbsoluteThresholdCents: 15000,
      enabled: true,
      description: "Alert when a category is trending materially above its recent baseline.",
    },
    {
      id: "large-unusual-invoice-default",
      name: "Large unusual invoice",
      ruleType: "large_unusual_invoice",
      severity: "critical",
      defaultPercentageThreshold: 50,
      defaultAbsoluteThresholdCents: 25000,
      enabled: true,
      description: "Alert when an invoice is abnormally large compared with the supplier's recent range.",
    },
    {
      id: "duplicate-spend-default",
      name: "Duplicate or suspicious spend",
      ruleType: "duplicate_spend",
      severity: "warning",
      defaultPercentageThreshold: 0,
      defaultAbsoluteThresholdCents: 5000,
      enabled: true,
      description: "Alert on suspected duplicate invoices or duplicated transaction references.",
    },
    {
      id: "new-supplier-default",
      name: "New supplier",
      ruleType: "new_supplier",
      severity: "info",
      defaultPercentageThreshold: 0,
      defaultAbsoluteThresholdCents: 20000,
      enabled: true,
      description: "Alert when a new supplier creates large or unusual spend with no prior baseline.",
    },
    {
      id: "recurring-increase-default",
      name: "Recurring increase",
      ruleType: "recurring_increase",
      severity: "warning",
      defaultPercentageThreshold: 15,
      defaultAbsoluteThresholdCents: 5000,
      enabled: true,
      description: "Alert when recurring commitments increase above the expected spend baseline.",
    },
    {
      id: "forecast-overrun-default",
      name: "Forecast overrun",
      ruleType: "forecast_overrun",
      severity: "critical",
      defaultPercentageThreshold: 10,
      defaultAbsoluteThresholdCents: 20000,
      enabled: true,
      description: "Alert when the projected month-end spend is materially above the expected range.",
    },
  ]
}
