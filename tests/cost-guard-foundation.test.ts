import { test } from "node:test"
import assert from "node:assert/strict"

import {
  BASELINE_WINDOWS,
  buildCostGuardForecastSummary,
  buildDefaultCostGuardRules,
  calculateBaseline,
  calculateForecast,
  detectCategoryIncrease,
  detectDuplicateSpend,
  detectLargeUnusualInvoice,
  detectNewSupplier,
  detectRecurringCostIncrease,
  detectSpendVelocity,
  detectSupplierIncrease,
  evaluateMateriality,
} from "@/lib/costGuard/foundation"

test("baseline calculation stores both average and median values", () => {
  const baseline = calculateBaseline([10000, 12000, 11000, 20000, 9000])

  assert.equal(baseline.sampleCount, 5)
  assert.equal(baseline.averageCents, 12400)
  assert.equal(baseline.medianCents, 11000)
  assert.ok(baseline.confidence > 0)
})

test("materiality evaluation requires both percentage and dollar thresholds", () => {
  const result = evaluateMateriality({
    actualCents: 25000,
    baselineCents: 18000,
    percentageThreshold: 20,
    absoluteThresholdCents: 5000,
  })

  assert.equal(result.varianceAmountCents, 7000)
  assert.ok(Math.abs(result.variancePercent) >= 20)
  assert.equal(result.passes, true)

  const lowDollarResult = evaluateMateriality({
    actualCents: 19000,
    baselineCents: 18000,
    percentageThreshold: 20,
    absoluteThresholdCents: 5000,
  })

  assert.equal(lowDollarResult.passes, false)
})

test("month-end forecast combines spend-to-date with commitments and expected remaining variable spend", () => {
  const forecast = calculateForecast({
    actualSpendCents: 150000,
    recurringCommitmentsCents: 40000,
    expectedVariableSpendCents: 30000,
    baselineSpendCents: 180000,
  })

  assert.equal(forecast.projectedMonthEndCents, 220000)
  assert.equal(forecast.varianceAmountCents, 40000)
  assert.ok(forecast.variancePercent > 0)
  assert.ok(forecast.confidence > 0)
})

test("forecast summary exposes the risk state expected by the dashboard", () => {
  const summary = buildCostGuardForecastSummary(
    calculateForecast({
      actualSpendCents: 150000,
      recurringCommitmentsCents: 40000,
      expectedVariableSpendCents: 30000,
      baselineSpendCents: 180000,
    }),
  )

  assert.equal(summary.projectedMonthEndCents, 220000)
  assert.equal(summary.varianceAmountCents, 40000)
  assert.equal(summary.status, "over_target")
  assert.ok(summary.message.includes("above"))
})

test("supplier, category, and velocity detectors trigger only on material drift", () => {
  const supplier = detectSupplierIncrease({
    actualCents: 180000,
    baselineCents: 120000,
    percentageThreshold: 20,
    absoluteThresholdCents: 10000,
  })
  const category = detectCategoryIncrease({
    actualCents: 160000,
    baselineCents: 100000,
    percentageThreshold: 25,
    absoluteThresholdCents: 15000,
  })
  const velocity = detectSpendVelocity({
    currentMonthToDateCents: 220000,
    baselineMonthToDateCents: 150000,
    percentageThreshold: 15,
    absoluteThresholdCents: 20000,
  })

  assert.equal(supplier.triggered, true)
  assert.equal(category.triggered, true)
  assert.equal(velocity.triggered, true)
  assert.ok(supplier.reason.includes("material"))
  assert.ok(velocity.confidence >= 50)
})

test("remaining signal detectors catch duplicate, unusual, new supplier, and recurring increases", () => {
  const duplicate = detectDuplicateSpend({
    currentAmountCents: 35000,
    baselineCents: 10000,
    thresholdCents: 20000,
    duplicateReferenceCount: 2,
  })
  const unusual = detectLargeUnusualInvoice({
    actualCents: 90000,
    baselineCents: 22000,
    percentageThreshold: 50,
    absoluteThresholdCents: 25000,
  })
  const newSupplier = detectNewSupplier({
    actualCents: 60000,
    historicalCents: 0,
    thresholdCents: 20000,
  })
  const recurring = detectRecurringCostIncrease({
    currentRecurringCents: 120000,
    baselineRecurringCents: 90000,
    percentageThreshold: 15,
    absoluteThresholdCents: 5000,
  })

  assert.equal(duplicate.triggered, true)
  assert.equal(unusual.triggered, true)
  assert.equal(newSupplier.triggered, true)
  assert.equal(recurring.triggered, true)
  assert.ok(duplicate.reason.toLowerCase().includes("duplicate"))
  assert.ok(unusual.reason.toLowerCase().includes("unusual"))
})

test("default Cost Guard rules cover the critical detection categories", () => {
  const rules = buildDefaultCostGuardRules()

  assert.deepEqual(BASELINE_WINDOWS, [3, 6, 12])
  assert.ok(rules.some((rule) => rule.ruleType === "supplier_increase"))
  assert.ok(rules.some((rule) => rule.ruleType === "category_increase"))
  assert.ok(rules.some((rule) => rule.ruleType === "forecast_overrun"))
})
