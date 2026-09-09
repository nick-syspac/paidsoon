export interface ReceivablesReliabilityInput {
  totalReceivablesCents: number
  disputedCents?: number
  overdue30To60Cents?: number
  overdue60PlusCents?: number
  brokenPromisesCount?: number
  activePromisesCount?: number
  highConfidenceReceivablesCents?: number
}

export interface ReceivablesReliabilityAssessment {
  reliabilityMultiplier: number
  highConfidenceCents: number
  riskyCents: number
  summary: string
  reasons: string[]
}

export interface TaxBufferProtectedCashInput {
  requiredReserveCents: number
  reservedCents?: number
  healthStatus?: "healthy" | "watch" | "underfunded" | "critical" | "unknown"
  enabled?: boolean
  allowOverride?: boolean
}

export interface TaxBufferProtectedCashAssessment {
  protectedCashCents: number
  excludedFromUsableCash: boolean
  summary: string
  reasons: string[]
}

export interface SavingsImpactInput {
  identifiedMonthlyCents?: number
  plannedMonthlyCents?: number
  realizedMonthlyCents?: number
  runwayDays?: number
  dailyBurnCents?: number
}

export interface SavingsImpactAssessment {
  identifiedCents: number
  plannedCents: number
  realizedCents: number
  potentialCents: number
  estimatedRunwayDaysImprovement: number
  status: "none" | "potential" | "planned" | "realized"
  summary: string
  reasons: string[]
}

export interface CommitmentRunwayImpactInput {
  currentRunwayDays: number
  usableCashCents: number
  proposedCommitmentCents?: number
  dailyBurnCents?: number
  warningThresholdDays?: number
  criticalThresholdDays?: number
}

export interface CommitmentRunwayImpactAssessment {
  currentRunwayDays: number
  postCommitmentRunwayDays: number
  deltaRunwayDays: number
  riskStatus: "safe" | "watch" | "warning" | "critical"
  summary: string
  reasons: string[]
}

export interface MarginGuardRunwayAdjustmentInput {
  currentRunwayDays: number
  usableCashCents: number
  grossMarginPercent?: number
  targetMarginPercent?: number
  projectedMarginPercent?: number
  dailyBurnCents?: number
  warningThresholdDays?: number
  criticalThresholdDays?: number
}

export interface MarginGuardRunwayAdjustmentAssessment {
  currentRunwayDays: number
  adjustedRunwayDays: number
  deltaRunwayDays: number
  riskStatus: "safe" | "watch" | "warning" | "critical"
  summary: string
  reasons: string[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function assessMarginGuardRunwayAdjustment(
  input: MarginGuardRunwayAdjustmentInput,
): MarginGuardRunwayAdjustmentAssessment {
  const currentRunwayDays = Math.max(0, input.currentRunwayDays ?? 0)
  const usableCashCents = Math.max(0, input.usableCashCents ?? 0)
  const dailyBurnCents = Math.max(1, input.dailyBurnCents ?? 25_000)
  const warningThresholdDays = Math.max(1, input.warningThresholdDays ?? 60)
  const criticalThresholdDays = Math.max(1, input.criticalThresholdDays ?? 30)
  const grossMarginPercent = Number.isFinite(input.grossMarginPercent ?? NaN) ? Number(input.grossMarginPercent) : 0
  const targetMarginPercent = Number.isFinite(input.targetMarginPercent ?? NaN)
    ? Number(input.targetMarginPercent)
    : 40
  const projectedMarginPercent = Number.isFinite(input.projectedMarginPercent ?? NaN)
    ? Number(input.projectedMarginPercent)
    : grossMarginPercent

  const marginGapPercent = Math.max(0, targetMarginPercent - projectedMarginPercent)
  const adjustmentPercent = clamp(marginGapPercent / Math.max(targetMarginPercent, 1), 0, 0.35)
  const reductionCents = usableCashCents * adjustmentPercent
  const adjustedCashCents = Math.max(0, usableCashCents - reductionCents)
  const adjustedRunwayDays = adjustedCashCents > 0 ? Math.max(0, Math.round(adjustedCashCents / dailyBurnCents)) : 0
  const deltaRunwayDays = adjustedRunwayDays - currentRunwayDays

  let riskStatus: MarginGuardRunwayAdjustmentAssessment["riskStatus"] = "safe"
  if (adjustedRunwayDays <= criticalThresholdDays) riskStatus = "critical"
  else if (adjustedRunwayDays <= warningThresholdDays) riskStatus = "warning"
  else if (adjustedRunwayDays <= warningThresholdDays * 1.5) riskStatus = "watch"

  const reasons = [
    `Gross margin is ${grossMarginPercent}% versus a ${targetMarginPercent}% target, which creates a margin deterioration signal.`,
    `MarginGuard forecasts a lower margin of ${projectedMarginPercent}%, reducing runway assumptions by ${adjustmentPercent * 100}% before cash-out planning.`,
    `Projected runway after the margin adjustment is ${adjustedRunwayDays} days using a ${dailyBurnCents} cent burn rate.`,
  ]

  return {
    currentRunwayDays,
    adjustedRunwayDays,
    deltaRunwayDays,
    riskStatus,
    summary: `Margin deterioration reduces runway from ${currentRunwayDays} to ${adjustedRunwayDays} days and flags ${riskStatus} risk in the forecast.`,
    reasons,
  }
}

export function assessCommitmentRunwayImpact(input: CommitmentRunwayImpactInput): CommitmentRunwayImpactAssessment {
  const currentRunwayDays = Math.max(0, input.currentRunwayDays ?? 0)
  const usableCashCents = Math.max(0, input.usableCashCents ?? 0)
  const proposedCommitmentCents = Math.max(0, input.proposedCommitmentCents ?? 0)
  const dailyBurnCents = Math.max(1, input.dailyBurnCents ?? 25_000)
  const warningThresholdDays = Math.max(1, input.warningThresholdDays ?? 60)
  const criticalThresholdDays = Math.max(1, input.criticalThresholdDays ?? 30)

  const reducedCashCents = Math.max(0, usableCashCents - proposedCommitmentCents)
  const postCommitmentRunwayDays = reducedCashCents > 0 ? Math.max(0, Math.round(reducedCashCents / dailyBurnCents)) : 0
  const deltaRunwayDays = postCommitmentRunwayDays - currentRunwayDays

  let riskStatus: CommitmentRunwayImpactAssessment["riskStatus"] = "safe"
  if (postCommitmentRunwayDays <= criticalThresholdDays) riskStatus = "critical"
  else if (postCommitmentRunwayDays <= warningThresholdDays) riskStatus = "warning"
  else if (postCommitmentRunwayDays <= warningThresholdDays * 1.5) riskStatus = "watch"

  const reasons = [
    `Current runway is ${currentRunwayDays} days before the proposed commitment is added.`,
    `The proposed commitment reduces usable cash by ${proposedCommitmentCents} cents before the runway calculation.`,
    `Post-commitment runway is projected at ${postCommitmentRunwayDays} days using a ${dailyBurnCents} cent daily burn assumption.`,
  ]

  return {
    currentRunwayDays,
    postCommitmentRunwayDays,
    deltaRunwayDays,
    riskStatus,
    summary: `Commitment pre-approval would reduce runway by ${Math.max(0, -deltaRunwayDays)} days and leave the business at ${riskStatus} risk after the commitment is approved.`,
    reasons,
  }
}

export function assessSavingsImpact(input: SavingsImpactInput): SavingsImpactAssessment {
  const identifiedCents = Math.max(0, input.identifiedMonthlyCents ?? 0)
  const plannedCents = Math.max(0, input.plannedMonthlyCents ?? 0)
  const realizedCents = Math.max(0, input.realizedMonthlyCents ?? 0)
  const dailyBurnCents = Math.max(1, input.dailyBurnCents ?? 25_000)

  const potentialCents = identifiedCents + plannedCents
  const estimatedRunwayDaysImprovement = potentialCents > 0 ? Math.max(1, Math.round(potentialCents / dailyBurnCents)) : 0
  const status = realizedCents > 0 ? "realized" : potentialCents > 0 ? "potential" : "none"

  const reasons = [
    `Identified savings are ${identifiedCents} cents and are treated as a potential runway improvement until realized.`,
    `Planned savings add ${plannedCents} cents to the expected runway benefit.`,
    `Realized savings currently contribute ${realizedCents} cents to actual cash improvement.`,
  ]

  const summary =
    potentialCents === 0
      ? "No savings signals are currently affecting runway."
      : `Identified and planned savings could improve runway by approximately ${estimatedRunwayDaysImprovement} days, while realized savings remain at ${realizedCents} cents.`

  return {
    identifiedCents,
    plannedCents,
    realizedCents,
    potentialCents,
    estimatedRunwayDaysImprovement,
    status,
    summary,
    reasons,
  }
}

export function assessTaxBufferProtectedCash(input: TaxBufferProtectedCashInput): TaxBufferProtectedCashAssessment {
  const requiredReserveCents = Math.max(0, input.requiredReserveCents ?? 0)
  const reservedCents = Math.max(0, input.reservedCents ?? requiredReserveCents)
  const enabled = input.enabled ?? true
  const allowOverride = input.allowOverride ?? false

  const protectedCashCents = enabled ? requiredReserveCents : 0
  const excludedFromUsableCash = enabled && !allowOverride

  const reasons: string[] = []
  if (!enabled) {
    reasons.push("Tax Buffer is disabled, so no reserve is protected from operating cash.")
  } else {
    reasons.push(`Tax reserve requirement of ${requiredReserveCents} cents is excluded from usable cash.`)
    if (reservedCents < requiredReserveCents) {
      reasons.push(`The reserve balance is under target by ${requiredReserveCents - reservedCents} cents.`)
    }
  }

  const summary = excludedFromUsableCash
    ? "Tax Buffer reserve is excluded from usable cash and remains protected until override is explicitly allowed."
    : "Tax Buffer reserve is included in the cash envelope because the override policy is enabled."

  return {
    protectedCashCents,
    excludedFromUsableCash,
    summary,
    reasons,
  }
}

export function assessReceivablesReliability(input: ReceivablesReliabilityInput): ReceivablesReliabilityAssessment {
  const totalReceivablesCents = Math.max(0, input.totalReceivablesCents)
  const disputedCents = Math.max(0, input.disputedCents ?? 0)
  const overdue30To60Cents = Math.max(0, input.overdue30To60Cents ?? 0)
  const overdue60PlusCents = Math.max(0, input.overdue60PlusCents ?? 0)
  const brokenPromisesCount = Math.max(0, input.brokenPromisesCount ?? 0)
  const activePromisesCount = Math.max(0, input.activePromisesCount ?? 0)
  const highConfidenceReceivablesCents = Math.max(
    0,
    input.highConfidenceReceivablesCents ?? Math.max(0, totalReceivablesCents - disputedCents - overdue30To60Cents - overdue60PlusCents),
  )

  const riskyCents = disputedCents + overdue30To60Cents + overdue60PlusCents * 1.5
  let multiplier = 1

  if (totalReceivablesCents > 0) {
    const disputedWeight = disputedCents / totalReceivablesCents
    const overdueWeight = (overdue30To60Cents + overdue60PlusCents) / totalReceivablesCents
    const riskWeight = riskyCents / totalReceivablesCents

    multiplier *= 1 - disputedWeight * 0.4
    multiplier *= 1 - Math.min(overdueWeight * 0.45, 0.35)
    multiplier *= 1 - Math.min(riskWeight * 0.2, 0.2)
  }

  if (brokenPromisesCount > 0) {
    multiplier *= 1 - Math.min(brokenPromisesCount * 0.08, 0.32)
  }

  if (activePromisesCount > 0) {
    multiplier *= 1 - Math.min(activePromisesCount * 0.03, 0.1)
  }

  const highConfidenceShare = totalReceivablesCents > 0 ? highConfidenceReceivablesCents / totalReceivablesCents : 0
  if (highConfidenceShare < 0.4) {
    multiplier *= 0.9
  }

  const finalMultiplier = clamp(Number(multiplier.toFixed(4)), 0.2, 1)

  const reasons: string[] = []
  if (disputedCents > 0) {
    reasons.push(`Disputed receivables account for ${disputedCents} cents of expected inflow.`)
  }
  if (overdue30To60Cents > 0 || overdue60PlusCents > 0) {
    reasons.push(`Overdue receivables total ${overdue30To60Cents + overdue60PlusCents} cents and reduce inflow reliability.`)
  }
  if (brokenPromisesCount > 0 || activePromisesCount > 0) {
    reasons.push(`Payment promises show ${brokenPromisesCount} broken and ${activePromisesCount} active commitments affecting collection confidence.`)
  }
  if (highConfidenceShare < 0.5) {
    reasons.push(`Only ${highConfidenceReceivablesCents} cents of receivables are currently considered high-confidence.`)
  }

  const summary =
    reasons.length > 0
      ? `Receivables are weighted at ${finalMultiplier.toFixed(2)}x due to disputed and overdue collection risk.`
      : "Receivables are considered stable and support full inflow confidence."

  return {
    reliabilityMultiplier: finalMultiplier,
    highConfidenceCents: highConfidenceReceivablesCents,
    riskyCents,
    summary,
    reasons,
  }
}
