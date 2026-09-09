import test from "node:test"
import assert from "node:assert/strict"

import {
  buildCashPlanRunwayInput,
  buildScenarioPresets,
  defaultRunwayGuardPolicy,
  normalizeScenarioInput,
  type ScenarioPreset,
} from "@/lib/runwayGuard/foundation"

test("cash plan timeline ingestion prefers forecast horizons and returns a usable runway input", () => {
  const input = buildCashPlanRunwayInput({
    openingCashCents: 2_000_000,
    protectedCashCents: 300_000,
    cashPlanTimeline: [
      { weekIndex: 0, closingCashCents: 1_700_000 },
      { weekIndex: 4, closingCashCents: 1_200_000 },
      { weekIndex: 8, closingCashCents: 300_000 },
      { weekIndex: 12, closingCashCents: 0 },
    ],
    horizonDays: 90,
  })

  assert.equal(input.forecast.length, 4)
  assert.equal(input.forecast[0].day, 0)
  assert.equal(input.forecast[3].day, 84)
  assert.equal(input.forecast[3].projectedCashCents, 0)
})

test("scenario presets expose base, conservative, and stress multipliers", () => {
  const presets = buildScenarioPresets(defaultRunwayGuardPolicy)

  assert.ok(presets.some((preset: ScenarioPreset) => preset.type === "base"))
  assert.ok(presets.some((preset: ScenarioPreset) => preset.type === "conservative"))
  assert.ok(presets.some((preset: ScenarioPreset) => preset.type === "stress"))
  assert.ok(presets.every((preset: ScenarioPreset) => preset.inflowMultiplier > 0))
})

test("custom scenario normalization rejects invalid or out-of-range values", () => {
  const valid = normalizeScenarioInput({
    inflowMultiplier: 0.9,
    outflowMultiplier: 1.2,
    horizonDays: 120,
  })

  assert.equal(valid.inflowMultiplier, 0.9)
  assert.equal(valid.outflowMultiplier, 1.2)
  assert.equal(valid.horizonDays, 120)

  assert.throws(() => {
    normalizeScenarioInput({ inflowMultiplier: 0, outflowMultiplier: 1 })
  })

  assert.throws(() => {
    normalizeScenarioInput({ inflowMultiplier: 1.2, outflowMultiplier: 4 })
  })
})
