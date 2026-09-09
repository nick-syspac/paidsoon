import test from "node:test"
import assert from "node:assert/strict"

import {
  calculateUsableCash,
  buildRunwaySummary,
  defaultRunwayGuardPolicy,
  simulateRunwayScenario,
} from "@/lib/runwayGuard/foundation"

test("usable cash excludes protected cash and tax reserves", () => {
  const usable = calculateUsableCash({
    openingCashCents: 1_200_000,
    protectedCashCents: 350_000,
    reserveBufferCents: 120_000,
    committedOutflowsCents: 80_000,
  })

  assert.equal(usable, 650_000)
})

test("runway summary prefers forecast data and reports a concrete exhaustion point", () => {
  const summary = buildRunwaySummary({
    openingCashCents: 1_200_000,
    protectedCashCents: 300_000,
    forecast: [
      { day: 0, projectedCashCents: 900_000 },
      { day: 30, projectedCashCents: 500_000 },
      { day: 60, projectedCashCents: 0 },
    ],
    policy: defaultRunwayGuardPolicy,
  })

  assert.equal(summary.usableCashCents, 900_000)
  assert.equal(summary.runwayDays, 60)
  assert.equal(summary.projectedExhaustionDay, 60)
  assert.equal(summary.status, "warning")
  assert.equal(summary.source, "cashplan")
  assert.ok(summary.reasons.some((reason) => reason.toLowerCase().includes("forecast")))
  assert.ok(summary.explainability.length > 0)
})

test("missing forecast data uses a low-confidence fallback estimate", () => {
  const summary = buildRunwaySummary({
    openingCashCents: 1_000_000,
    protectedCashCents: 200_000,
    missingData: true,
    estimatedDailyBurnCents: 25_000,
    policy: defaultRunwayGuardPolicy,
  })

  assert.equal(summary.source, "estimate")
  assert.ok(summary.confidence < 0.8)
  assert.equal(summary.status, "warning")
  assert.ok(summary.reasons.some((reason) => reason.toLowerCase().includes("missing")))
})

test("scenario simulation returns deltas and estimate disclaimers", () => {
  const base = buildRunwaySummary({
    openingCashCents: 1_000_000,
    protectedCashCents: 100_000,
    forecast: [
      { day: 0, projectedCashCents: 900_000 },
      { day: 30, projectedCashCents: 500_000 },
      { day: 60, projectedCashCents: 100_000 },
      { day: 90, projectedCashCents: 0 },
    ],
    policy: defaultRunwayGuardPolicy,
  })

  const scenario = simulateRunwayScenario({
    baseSummary: base,
    scenarioType: "stress",
    inflowMultiplier: 0.8,
    outflowMultiplier: 1.35,
    policy: defaultRunwayGuardPolicy,
  })

  assert.equal(scenario.impact_on_runway_days <= 0, true)
  assert.ok(scenario.assumptions.length >= 2)
  assert.ok(scenario.estimate_disclaimer.toLowerCase().includes("estimate"))
  assert.ok(scenario.new_runway_status.length > 0)
})
