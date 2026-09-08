export type MarginConfidence = "high" | "medium" | "low" | "insufficient_data"
export type MarginStatus = "healthy" | "watch" | "warning" | "critical" | "insufficient_data"

export interface MarginThresholds {
  targetPercent: number
  warningPercent: number
  criticalPercent: number
}

export interface MarginComputationInput {
  revenueCents: number
  directCostCents: number
}

export interface GrossMarginResult {
  grossProfitCents: number
  grossMarginPercent: number | null
  reason: "ok" | "zero_revenue" | "missing_input"
}

export interface ContributionMarginInput {
  revenueCents: number
  variableCostCents: number
  completenessPercent: number
  minimumCompletenessPercent: number
}

export interface ContributionMarginResult {
  contributionMarginCents: number | null
  contributionMarginPercent: number | null
  available: boolean
  reason: "ok" | "insufficient_data" | "zero_revenue" | "missing_input"
}

export interface RequiredPriceInput {
  directCostCents: number
  targetMarginPercent: number
  currentPriceCents?: number | null
}

export interface RequiredPriceResult {
  requiredPriceCents: number
  expectedGrossProfitCents: number
  deltaFromCurrentPriceCents: number | null
}

export interface MarginImpactInput {
  revenueCents: number
  directCostCents: number
  directCostChangePercent?: number
  priceChangePercent?: number
  volumeChangePercent?: number
}

export interface MarginImpactResult {
  baseRevenueCents: number
  baseDirectCostCents: number
  baseGrossProfitCents: number
  baseGrossMarginPercent: number | null
  projectedRevenueCents: number
  projectedDirectCostCents: number
  projectedGrossProfitCents: number
  projectedGrossMarginPercent: number | null
  grossProfitDeltaCents: number
  grossMarginDeltaPercent: number | null
}

export interface DataCompletenessInput {
  revenueMappedPercent: number
  expenseClassifiedPercent: number
  directCostAssignedPercent: number
  customerMappedPercent: number
  productServiceMappedPercent?: number | null
}

export interface DataCompletenessResult {
  completenessPercent: number
  confidence: MarginConfidence
  missingItems: string[]
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

function clampPercent(value: number): number {
  if (!isFiniteNumber(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100
}

function safePercentRatio(numerator: number, denominator: number): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator)) return null
  if (denominator === 0) return null
  return roundTo2((numerator / denominator) * 100)
}

export function validateMarginThresholds(thresholds: MarginThresholds): void {
  const { targetPercent, warningPercent, criticalPercent } = thresholds
  if (![targetPercent, warningPercent, criticalPercent].every(isFiniteNumber)) {
    throw new Error("Margin thresholds must be finite numbers")
  }
  if (targetPercent <= 0 || targetPercent >= 100) {
    throw new Error("Target margin must be greater than 0 and less than 100")
  }
  if (warningPercent < 0 || warningPercent >= 100 || criticalPercent < 0 || criticalPercent >= 100) {
    throw new Error("Warning and critical thresholds must be between 0 and 100")
  }
  if (!(criticalPercent < warningPercent && warningPercent < targetPercent)) {
    throw new Error("Thresholds must satisfy critical < warning < target")
  }
}

export function calculateGrossProfit(input: MarginComputationInput): number {
  if (!isFiniteNumber(input.revenueCents) || !isFiniteNumber(input.directCostCents)) {
    throw new Error("Revenue and direct costs must be finite numbers")
  }
  return Math.round(input.revenueCents - input.directCostCents)
}

export function calculateGrossMargin(input: MarginComputationInput): GrossMarginResult {
  if (!isFiniteNumber(input.revenueCents) || !isFiniteNumber(input.directCostCents)) {
    return {
      grossProfitCents: 0,
      grossMarginPercent: null,
      reason: "missing_input",
    }
  }

  const grossProfitCents = calculateGrossProfit(input)
  if (input.revenueCents === 0) {
    return {
      grossProfitCents,
      grossMarginPercent: null,
      reason: "zero_revenue",
    }
  }

  return {
    grossProfitCents,
    grossMarginPercent: safePercentRatio(grossProfitCents, input.revenueCents),
    reason: "ok",
  }
}

export function calculateContributionMargin(input: ContributionMarginInput): ContributionMarginResult {
  const completeness = clampPercent(input.completenessPercent)
  if (
    !isFiniteNumber(input.revenueCents) ||
    !isFiniteNumber(input.variableCostCents) ||
    !isFiniteNumber(input.minimumCompletenessPercent)
  ) {
    return {
      contributionMarginCents: null,
      contributionMarginPercent: null,
      available: false,
      reason: "missing_input",
    }
  }

  if (completeness < clampPercent(input.minimumCompletenessPercent)) {
    return {
      contributionMarginCents: null,
      contributionMarginPercent: null,
      available: false,
      reason: "insufficient_data",
    }
  }

  const contributionMarginCents = Math.round(input.revenueCents - input.variableCostCents)
  if (input.revenueCents === 0) {
    return {
      contributionMarginCents,
      contributionMarginPercent: null,
      available: true,
      reason: "zero_revenue",
    }
  }

  return {
    contributionMarginCents,
    contributionMarginPercent: safePercentRatio(contributionMarginCents, input.revenueCents),
    available: true,
    reason: "ok",
  }
}

export function calculateMarginVariance(actualMarginPercent: number | null, targetMarginPercent: number): number | null {
  if (actualMarginPercent === null) return null
  if (!isFiniteNumber(actualMarginPercent) || !isFiniteNumber(targetMarginPercent)) return null
  return roundTo2(actualMarginPercent - targetMarginPercent)
}

export function calculateRequiredPrice(input: RequiredPriceInput): RequiredPriceResult {
  const target = input.targetMarginPercent
  if (!isFiniteNumber(input.directCostCents) || input.directCostCents < 0) {
    throw new Error("Direct cost must be a finite non-negative number")
  }
  if (!isFiniteNumber(target) || target <= 0 || target >= 100) {
    throw new Error("Target margin must be greater than 0 and less than 100")
  }

  const targetRatio = target / 100
  const divisor = 1 - targetRatio
  const requiredPriceCents = Math.ceil(input.directCostCents / divisor)
  const expectedGrossProfitCents = requiredPriceCents - input.directCostCents
  const deltaFromCurrentPriceCents =
    input.currentPriceCents === null || input.currentPriceCents === undefined
      ? null
      : Math.round(requiredPriceCents - input.currentPriceCents)

  return {
    requiredPriceCents,
    expectedGrossProfitCents,
    deltaFromCurrentPriceCents,
  }
}

function applyPercentDelta(amountCents: number, deltaPercent: number | undefined): number {
  const delta = isFiniteNumber(deltaPercent ?? 0) ? (deltaPercent ?? 0) : 0
  return Math.round(amountCents * (1 + delta / 100))
}

export function calculateMarginImpact(input: MarginImpactInput): MarginImpactResult {
  if (!isFiniteNumber(input.revenueCents) || !isFiniteNumber(input.directCostCents)) {
    throw new Error("Revenue and direct costs must be finite numbers")
  }

  const volumeAdjustedRevenue = applyPercentDelta(input.revenueCents, input.volumeChangePercent)
  const projectedRevenueCents = applyPercentDelta(volumeAdjustedRevenue, input.priceChangePercent)
  const volumeAdjustedCost = applyPercentDelta(input.directCostCents, input.volumeChangePercent)
  const projectedDirectCostCents = applyPercentDelta(volumeAdjustedCost, input.directCostChangePercent)

  const base = calculateGrossMargin({ revenueCents: input.revenueCents, directCostCents: input.directCostCents })
  const projected = calculateGrossMargin({
    revenueCents: projectedRevenueCents,
    directCostCents: projectedDirectCostCents,
  })

  return {
    baseRevenueCents: input.revenueCents,
    baseDirectCostCents: input.directCostCents,
    baseGrossProfitCents: base.grossProfitCents,
    baseGrossMarginPercent: base.grossMarginPercent,
    projectedRevenueCents,
    projectedDirectCostCents,
    projectedGrossProfitCents: projected.grossProfitCents,
    projectedGrossMarginPercent: projected.grossMarginPercent,
    grossProfitDeltaCents: projected.grossProfitCents - base.grossProfitCents,
    grossMarginDeltaPercent:
      base.grossMarginPercent === null || projected.grossMarginPercent === null
        ? null
        : roundTo2(projected.grossMarginPercent - base.grossMarginPercent),
  }
}

export function calculateDataCompleteness(input: DataCompletenessInput): DataCompletenessResult {
  const weights = {
    revenueMappedPercent: 0.25,
    expenseClassifiedPercent: 0.35,
    directCostAssignedPercent: 0.25,
    customerMappedPercent: 0.1,
    productServiceMappedPercent: 0.05,
  } as const

  const revenueMappedPercent = clampPercent(input.revenueMappedPercent)
  const expenseClassifiedPercent = clampPercent(input.expenseClassifiedPercent)
  const directCostAssignedPercent = clampPercent(input.directCostAssignedPercent)
  const customerMappedPercent = clampPercent(input.customerMappedPercent)
  const productServiceMappedPercent = clampPercent(input.productServiceMappedPercent ?? 0)

  const completenessPercent = roundTo2(
    revenueMappedPercent * weights.revenueMappedPercent +
      expenseClassifiedPercent * weights.expenseClassifiedPercent +
      directCostAssignedPercent * weights.directCostAssignedPercent +
      customerMappedPercent * weights.customerMappedPercent +
      productServiceMappedPercent * weights.productServiceMappedPercent,
  )

  const missingItems: string[] = []
  if (revenueMappedPercent < 90) missingItems.push("Map additional revenue records")
  if (expenseClassifiedPercent < 90) missingItems.push("Classify remaining expenses")
  if (directCostAssignedPercent < 90) missingItems.push("Assign direct costs to records")
  if (customerMappedPercent < 90) missingItems.push("Link revenue and cost records to customers")
  if (productServiceMappedPercent < 75) missingItems.push("Improve product/service mapping coverage")

  let confidence: MarginConfidence = "high"
  if (completenessPercent < 50) confidence = "insufficient_data"
  else if (completenessPercent < 75) confidence = "low"
  else if (completenessPercent < 90) confidence = "medium"

  return {
    completenessPercent,
    confidence,
    missingItems,
  }
}

export function determineMarginStatus(args: {
  grossMarginPercent: number | null
  thresholds: MarginThresholds
  confidence: MarginConfidence
}): MarginStatus {
  validateMarginThresholds(args.thresholds)
  if (args.confidence === "insufficient_data") return "insufficient_data"
  if (args.grossMarginPercent === null) return "insufficient_data"

  const value = args.grossMarginPercent
  if (value < args.thresholds.criticalPercent) return "critical"
  if (value < args.thresholds.warningPercent) return "warning"
  if (value < args.thresholds.targetPercent) return "watch"
  return "healthy"
}
