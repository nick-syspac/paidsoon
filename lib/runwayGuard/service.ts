import {
  buildRunwaySummary,
  defaultRunwayGuardPolicy,
  evaluateRunwayAlertTransition,
  evaluateRunwayMaterialChange,
  simulateRunwayScenario,
  type BuildRunwaySummaryInput,
  type RunwaySummary,
  type RunwayScenarioResult,
  type RunwayAlertTransitionResult,
  type RunwayMaterialChangeResult,
} from "@/lib/runwayGuard/foundation"

export interface RunwayGuardServiceInput extends BuildRunwaySummaryInput {
  horizonDays?: number
  previousRunwayDays?: number
  previousProtectedCashCents?: number
  scenario?: {
    inflowMultiplier?: number
    outflowMultiplier?: number
  }
}

export interface RunwayGuardServiceOutput {
  summary: RunwaySummary
  scenario: RunwayScenarioResult
  alert: RunwayAlertTransitionResult
  materialChange: RunwayMaterialChangeResult
}

export function buildRunwayGuardServiceOutput(input: RunwayGuardServiceInput): RunwayGuardServiceOutput {
  const policy = {
    ...defaultRunwayGuardPolicy,
    ...(input.policy ?? {}),
    ...(input.horizonDays !== undefined ? { horizonDays: input.horizonDays } : {}),
  }

  const summary = buildRunwaySummary({
    ...input,
    policy,
  })
  const previousRunwayDays = input.previousRunwayDays ?? summary.runwayDays
  const previousProtectedCashCents = input.previousProtectedCashCents ?? (input.protectedCashCents ?? 0)
  const scenario = simulateRunwayScenario({
    baseSummary: summary,
    scenarioType: "custom",
    inflowMultiplier: input.scenario?.inflowMultiplier ?? 1,
    outflowMultiplier: input.scenario?.outflowMultiplier ?? 1,
    policy,
  })
  const alert = evaluateRunwayAlertTransition({
    previousRunwayDays,
    currentRunwayDays: summary.runwayDays,
    policy,
  })
  const materialChange = evaluateRunwayMaterialChange({
    previousRunwayDays,
    currentRunwayDays: summary.runwayDays,
    previousProtectedCashCents,
    currentProtectedCashCents: input.protectedCashCents ?? previousProtectedCashCents,
    policy,
  })

  return {
    summary,
    scenario,
    alert,
    materialChange,
  }
}
