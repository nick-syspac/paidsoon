export type RunwayStatus =
  | "healthy"
  | "watch"
  | "warning"
  | "critical"
  | "sustainable-within-horizon"
  | "estimate"

export type RunwayScenarioType = "base" | "conservative" | "stress" | "custom"

export interface RunwayGuardPolicy {
  horizonDays: number
  warningThresholdDays: number
  criticalThresholdDays: number
  lowConfidenceWeight: number
  minimumConfidence: number
}

export interface CashPlanTimelinePoint {
  weekIndex: number
  closingCashCents: number
}

export interface RunwayForecastPoint {
  day: number
  projectedCashCents: number
}

export interface ScenarioPreset {
  type: "base" | "conservative" | "stress"
  label: string
  inflowMultiplier: number
  outflowMultiplier: number
  description: string
}

export interface BuildCashPlanRunwayInput {
  openingCashCents: number
  protectedCashCents?: number
  cashPlanTimeline?: CashPlanTimelinePoint[]
  horizonDays?: number
}

export interface NormalizedScenarioInput {
  scenarioType: RunwayScenarioType
  inflowMultiplier: number
  outflowMultiplier: number
  horizonDays: number
}

export interface CalculateUsableCashInput {
  openingCashCents: number
  protectedCashCents?: number
  reserveBufferCents?: number
  committedOutflowsCents?: number
}

export interface BuildRunwaySummaryInput {
  openingCashCents: number
  protectedCashCents?: number
  reserveBufferCents?: number
  committedOutflowsCents?: number
  forecast?: RunwayForecastPoint[]
  missingData?: boolean
  estimatedDailyBurnCents?: number
  policy?: RunwayGuardPolicy
}

export interface RunwaySummary {
  usableCashCents: number
  runwayDays: number
  projectedExhaustionDay: number
  status: Exclude<RunwayStatus, "estimate">
  source: "cashplan" | "estimate"
  confidence: number
  reasons: string[]
  explainability: string[]
}

export interface RunwayScenarioResult {
  scenarioType: RunwayScenarioType
  impact_on_runway_days: number
  impact_on_minimum_cash: number
  new_cash_out_date: number
  new_runway_days: number
  new_runway_status: string
  assumptions: string[]
  estimate_disclaimer: string
}

export interface RunwayAlertTransitionResult {
  event: "breach" | "recovery" | "none"
  severity: "info" | "warning" | "critical"
  message: string
}

export interface RunwayMaterialChangeResult {
  hasMaterialChange: boolean
  severity: "info" | "warning" | "critical"
  reason: string
  dedupeKey: string
}

export interface RunwaySnapshotRecordInput {
  userId: string
  summary: RunwaySummary
  snapshotAt?: Date
}

export interface RunwaySnapshotRecord {
  userId: string
  snapshotAt: Date
  usableCashCents: number
  runwayDays: number
  projectedExhaustionDay: number
  status: string
  confidence: number
  assumptions: Record<string, unknown>
  reasons: string[]
  explainability: string[]
  dedupeKey: string
}

export interface RunwayTrendInput {
  snapshotAt: Date
  runwayDays: number
}

export interface RunwayTrendResult {
  currentRunwayDays: number
  previousRunwayDays: number
  deltaRunwayDays: number
  direction: "stable" | "declining" | "improving"
  summary: string
}

export const defaultRunwayGuardPolicy: RunwayGuardPolicy = {
  horizonDays: 180,
  warningThresholdDays: 90,
  criticalThresholdDays: 45,
  lowConfidenceWeight: 0.6,
  minimumConfidence: 0.5,
}

export function buildCashPlanRunwayInput(input: BuildCashPlanRunwayInput): { openingCashCents: number; forecast: RunwayForecastPoint[] } {
  const horizonDays = Math.max(7, input.horizonDays ?? defaultRunwayGuardPolicy.horizonDays)
  const protectedCashCents = Math.max(0, input.protectedCashCents ?? 0)

  const forecast = (input.cashPlanTimeline ?? [])
    .filter((point) => point.weekIndex >= 0)
    .sort((a, b) => a.weekIndex - b.weekIndex)
    .filter((point) => point.weekIndex * 7 <= horizonDays)
    .map((point) => ({
      day: point.weekIndex * 7,
      projectedCashCents: Math.max(0, point.closingCashCents - protectedCashCents),
    }))

  return {
    openingCashCents: input.openingCashCents,
    forecast,
  }
}

export function buildScenarioPresets(policy: RunwayGuardPolicy = defaultRunwayGuardPolicy): ScenarioPreset[] {
  const presets: ScenarioPreset[] = [
    {
      type: "base",
      label: "Base",
      inflowMultiplier: 1,
      outflowMultiplier: 1,
      description: "Uses the current forecast without change.",
    },
    {
      type: "conservative",
      label: "Conservative",
      inflowMultiplier: 0.9,
      outflowMultiplier: 1.15,
      description: "Moderately reduces inflows and lifts outflows.",
    },
    {
      type: "stress",
      label: "Stress",
      inflowMultiplier: 0.7,
      outflowMultiplier: 1.35,
      description: "Applies a more severe cash-compression assumption set.",
    },
  ]

  return presets.map((preset) => ({
    ...preset,
    inflowMultiplier: Number(preset.inflowMultiplier),
    outflowMultiplier: Number(preset.outflowMultiplier),
    description: `${preset.description} Horizon: ${policy.horizonDays} days`,
  }))
}

export function normalizeScenarioInput(input: {
  scenarioType?: RunwayScenarioType
  inflowMultiplier?: number
  outflowMultiplier?: number
  horizonDays?: number
}): NormalizedScenarioInput {
  const scenarioType = input.scenarioType ?? "custom"
  const inflowMultiplier = Number(input.inflowMultiplier ?? 1)
  const outflowMultiplier = Number(input.outflowMultiplier ?? 1)
  const horizonDays = Number(input.horizonDays ?? defaultRunwayGuardPolicy.horizonDays)

  if (!Number.isFinite(inflowMultiplier) || inflowMultiplier <= 0 || inflowMultiplier > 2) {
    throw new TypeError("inflowMultiplier must be a number between 0 and 2.")
  }
  if (!Number.isFinite(outflowMultiplier) || outflowMultiplier <= 0 || outflowMultiplier > 2) {
    throw new TypeError("outflowMultiplier must be a number between 0 and 2.")
  }
  if (!Number.isInteger(horizonDays) || horizonDays <= 0 || horizonDays > 3650) {
    throw new TypeError("horizonDays must be a positive integer no greater than 3650.")
  }
  if (!"base,conservative,stress,custom".split(",").includes(scenarioType)) {
    throw new TypeError("scenarioType must be one of base, conservative, stress, or custom.")
  }

  return {
    scenarioType,
    inflowMultiplier,
    outflowMultiplier,
    horizonDays,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function calculateUsableCash(input: CalculateUsableCashInput): number {
  const protectedCashCents = Math.max(0, input.protectedCashCents ?? 0)
  const reserveBufferCents = Math.max(0, input.reserveBufferCents ?? 0)
  const committedOutflowsCents = Math.max(0, input.committedOutflowsCents ?? 0)

  const usable = input.openingCashCents - protectedCashCents - reserveBufferCents - committedOutflowsCents
  return Math.max(0, usable)
}

export function buildRunwaySummary(input: BuildRunwaySummaryInput): RunwaySummary {
  const policy = input.policy ?? defaultRunwayGuardPolicy
  const usableCashCents = calculateUsableCash(input)
  const explainability = [
    `Opening cash: ${input.openingCashCents}`,
    `Protected cash excluded: ${input.protectedCashCents ?? 0}`,
    `Reserve buffer excluded: ${input.reserveBufferCents ?? 0}`,
    `Committed outflows excluded: ${input.committedOutflowsCents ?? 0}`,
    `Usable cash after adjustments: ${usableCashCents}`,
  ]

  if (input.missingData) {
    const burnCents = Math.max(1, input.estimatedDailyBurnCents ?? 1)
    const estimatedDays = Math.max(0, Math.floor(usableCashCents / burnCents))
    const confidence = clamp(0.72 - burnCents / 1_000_000, 0.2, 0.75)
    const status: Exclude<RunwayStatus, "estimate"> = estimatedDays <= policy.warningThresholdDays ? "warning" : "watch"

    return {
      usableCashCents,
      runwayDays: estimatedDays,
      projectedExhaustionDay: estimatedDays,
      status,
      source: "estimate",
      confidence,
      reasons: [
        "Missing forecast data; using a low-confidence estimate.",
        "Runway is based on estimated daily burn and should be treated as directional only.",
      ],
      explainability: [
        ...explainability,
        `Missing-data fallback in use; estimated daily burn is ${burnCents} cents per day.`,
      ],
    }
  }

  const orderedForecast = [...(input.forecast ?? [])].sort((a, b) => a.day - b.day)
  if (orderedForecast.length === 0) {
    const estimatedDays = Math.max(0, Math.floor(usableCashCents / Math.max(1, input.estimatedDailyBurnCents ?? usableCashCents)))
    const confidence = clamp(policy.minimumConfidence + 0.2, 0.2, 0.75)
    return {
      usableCashCents,
      runwayDays: estimatedDays,
      projectedExhaustionDay: estimatedDays,
      status: "watch",
      source: "estimate",
      confidence,
      reasons: [
        "No forecast timeline was supplied; using a conservative estimate.",
      ],
      explainability: [
        ...explainability,
        "No CashPlan forecast data was available, so the estimate path was used.",
      ],
    }
  }

  const earliestZero = orderedForecast.find((point) => point.projectedCashCents <= 0)
  const projectedExhaustionDay = earliestZero ? earliestZero.day : Math.max(...orderedForecast.map((point) => point.day))
  const runwayDays = earliestZero ? earliestZero.day : Math.max(0, projectedExhaustionDay)

  const status: Exclude<RunwayStatus, "estimate"> =
    earliestZero === undefined
      ? "sustainable-within-horizon"
      : runwayDays <= policy.criticalThresholdDays
        ? "critical"
        : runwayDays <= policy.warningThresholdDays
          ? "warning"
          : "watch"

  const confidence = clamp(0.93 - (orderedForecast.length < 4 ? 0.1 : 0), 0.6, 0.97)
  const reasons = [
    `Forecast timeline indicates the projected cash-out day at ${projectedExhaustionDay}.`,
    `Protected balances were excluded before the runway calculation.`,
    earliestZero === undefined
      ? "Projected usable cash stays above zero through the configured horizon."
      : "Projected usable cash reaches zero within the selected forecast horizon.",
  ]

  return {
    usableCashCents,
    runwayDays,
    projectedExhaustionDay,
    status,
    source: "cashplan",
    confidence,
    reasons,
    explainability: [
      ...explainability,
      `CashPlan forecast horizon: ${orderedForecast.length} points.`,
      `Projected exhaustion day: ${projectedExhaustionDay}`,
      `Policy thresholds: warning ${policy.warningThresholdDays}, critical ${policy.criticalThresholdDays}`,
    ],
  }
}

export function buildRunwaySnapshotRecord(input: RunwaySnapshotRecordInput): RunwaySnapshotRecord {
  const snapshotAt = input.snapshotAt ?? new Date()
  const summary = input.summary

  return {
    userId: input.userId,
    snapshotAt,
    usableCashCents: summary.usableCashCents,
    runwayDays: summary.runwayDays,
    projectedExhaustionDay: summary.projectedExhaustionDay,
    status: summary.status,
    confidence: summary.confidence,
    assumptions: {
      source: summary.source,
      status: summary.status,
      thresholdDays: summary.runwayDays,
    },
    reasons: summary.reasons,
    explainability: summary.explainability,
    dedupeKey: `runway-guard:snapshot:${input.userId}:${snapshotAt.toISOString()}`,
  }
}

export function calculateRunwayTrend(history: RunwayTrendInput[]): RunwayTrendResult {
  if (history.length === 0) {
    return {
      currentRunwayDays: 0,
      previousRunwayDays: 0,
      deltaRunwayDays: 0,
      direction: "stable",
      summary: "No runway history is available yet.",
    }
  }

  const sorted = [...history].sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime())
  const current = sorted[sorted.length - 1]
  const previous = sorted[sorted.length - 2] ?? current
  const delta = current.runwayDays - previous.runwayDays

  let direction: RunwayTrendResult["direction"] = "stable"
  if (delta < 0) direction = "declining"
  else if (delta > 0) direction = "improving"

  return {
    currentRunwayDays: current.runwayDays,
    previousRunwayDays: previous.runwayDays,
    deltaRunwayDays: delta,
    direction,
    summary:
      delta < 0
        ? `Runway is declining by ${Math.abs(delta)} days across the latest snapshot history.`
        : delta > 0
          ? `Runway is improving by ${delta} days across the latest snapshot history.`
          : "Runway is stable across the latest snapshot history.",
  }
}

export function simulateRunwayScenario(input: {
  baseSummary: RunwaySummary
  scenarioType?: RunwayScenarioType
  inflowMultiplier?: number
  outflowMultiplier?: number
  policy?: RunwayGuardPolicy
}): RunwayScenarioResult {
  const scenarioType = input.scenarioType ?? "base"
  const inflowMultiplier = input.inflowMultiplier ?? 1
  const outflowMultiplier = input.outflowMultiplier ?? 1
  const policy = input.policy ?? defaultRunwayGuardPolicy

  const effectiveInflows = clamp(inflowMultiplier, 0.2, 2)
  const effectiveOutflows = clamp(outflowMultiplier, 0.4, 2)
  const runwayAdjustmentFactor = effectiveInflows / effectiveOutflows
  const newRunwayDays = Math.max(0, Math.round(input.baseSummary.runwayDays * runwayAdjustmentFactor))
  const impactOnRunwayDays = newRunwayDays - input.baseSummary.runwayDays
  const impactOnMinimumCash = Math.round((input.baseSummary.usableCashCents * (1 - runwayAdjustmentFactor)) * 0.6)
  const newCashOutDate = Math.max(0, input.baseSummary.projectedExhaustionDay + impactOnRunwayDays)
  const newRunwayStatus =
    newRunwayDays <= policy.criticalThresholdDays
      ? "critical"
      : newRunwayDays <= policy.warningThresholdDays
        ? "warning"
        : "watch"

  const assumptions = [
    `Inflow multiplier: ${effectiveInflows}`,
    `Outflow multiplier: ${effectiveOutflows}`,
    `Scenario: ${scenarioType}`,
  ]

  return {
    scenarioType,
    impact_on_runway_days: impactOnRunwayDays,
    impact_on_minimum_cash: impactOnMinimumCash,
    new_cash_out_date: newCashOutDate,
    new_runway_days: newRunwayDays,
    new_runway_status: newRunwayStatus,
    assumptions,
    estimate_disclaimer:
      "This scenario result is an estimate based on the selected assumption set and is not a guaranteed financial outcome.",
  }
}

export function evaluateRunwayAlertTransition(input: {
  previousRunwayDays: number
  currentRunwayDays: number
  policy: RunwayGuardPolicy
}): RunwayAlertTransitionResult {
  const previous = input.previousRunwayDays
  const current = input.currentRunwayDays

  if (current <= input.policy.criticalThresholdDays && previous > input.policy.criticalThresholdDays) {
    return {
      event: "breach",
      severity: "critical",
      message: "Runway has breached the critical threshold after a material decline in cash runway.",
    }
  }

  if (current <= input.policy.warningThresholdDays && previous > input.policy.warningThresholdDays) {
    return {
      event: "breach",
      severity: "warning",
      message: "Runway breach: the runway has crossed into the warning band.",
    }
  }

  if (current > input.policy.warningThresholdDays && previous <= input.policy.warningThresholdDays) {
    return {
      event: "recovery",
      severity: "info",
      message: "Recovery: runway has moved back above the warning threshold.",
    }
  }

  return {
    event: "none",
    severity: "info",
    message: "No threshold transition detected.",
  }
}

export function evaluateRunwayMaterialChange(input: {
  previousRunwayDays: number
  currentRunwayDays: number
  previousProtectedCashCents: number
  currentProtectedCashCents: number
  policy: RunwayGuardPolicy
}): RunwayMaterialChangeResult {
  const runwayDrop = Math.max(0, input.previousRunwayDays - input.currentRunwayDays)
  const protectedCashIncrease = Math.max(0, input.currentProtectedCashCents - input.previousProtectedCashCents)
  const materialDecline = runwayDrop >= Math.max(15, input.policy.warningThresholdDays * 0.15)
  const materialProtectedPressure = protectedCashIncrease >= 50_000

  if (!materialDecline && !materialProtectedPressure) {
    return {
      hasMaterialChange: false,
      severity: "info",
      reason: "No material runway deterioration detected.",
      dedupeKey: `runway-guard:nominal:${input.previousRunwayDays}-${input.currentRunwayDays}`,
    }
  }

  const severity = runwayDrop >= input.policy.warningThresholdDays * 2 ? "critical" : "warning"
  return {
    hasMaterialChange: true,
    severity,
    reason: materialDecline
      ? `Material runway decline detected: runway dropped by ${runwayDrop} days.`
      : `Material protected-cash pressure detected: protected cash increased by ${protectedCashIncrease} cents.`,
    dedupeKey: `runway-guard:material:${Math.max(0, input.currentRunwayDays)}-${Math.max(0, input.currentProtectedCashCents)}`,
  }
}
