import test from "node:test"
import assert from "node:assert/strict"

import { buildRunwayGuardServiceOutput } from "@/lib/runwayGuard/service"

test("runway guard service composes summary, simulation, and alert outputs", () => {
  const output = buildRunwayGuardServiceOutput({
    openingCashCents: 1_500_000,
    protectedCashCents: 250_000,
    reserveBufferCents: 100_000,
    committedOutflowsCents: 50_000,
    forecast: [
      { day: 0, projectedCashCents: 1_100_000 },
      { day: 30, projectedCashCents: 750_000 },
      { day: 60, projectedCashCents: 200_000 },
      { day: 90, projectedCashCents: 0 },
    ],
    previousRunwayDays: 150,
    previousProtectedCashCents: 200_000,
    scenario: { inflowMultiplier: 0.9, outflowMultiplier: 1.2 },
  })

  assert.equal(output.summary.source, "cashplan")
  assert.equal(output.summary.runwayDays, 90)
  assert.ok(output.scenario.impact_on_runway_days !== undefined)
  assert.ok(output.alert.event === "breach" || output.alert.event === "none")
  assert.ok(output.materialChange.hasMaterialChange === true || output.materialChange.hasMaterialChange === false)
})
