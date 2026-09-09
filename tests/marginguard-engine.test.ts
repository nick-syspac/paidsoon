import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateContributionMargin,
  calculateDataCompleteness,
  calculateGrossMargin,
  calculateGrossProfit,
  calculateMarginImpact,
  calculateMarginVariance,
  calculateRequiredPrice,
  determineMarginStatus,
  validateMarginThresholds,
} from "@/lib/marginguard/engine"

test("gross profit and gross margin follow deterministic formulas", () => {
  const grossProfit = calculateGrossProfit({ revenueCents: 5200000, directCostCents: 3542000 })
  assert.equal(grossProfit, 1658000)

  const grossMargin = calculateGrossMargin({ revenueCents: 5200000, directCostCents: 3542000 })
  assert.equal(grossMargin.grossProfitCents, 1658000)
  assert.equal(grossMargin.grossMarginPercent, 31.88)
  assert.equal(grossMargin.reason, "ok")
})

test("gross margin handles zero and missing values safely", () => {
  const zeroRevenue = calculateGrossMargin({ revenueCents: 0, directCostCents: 1000 })
  assert.equal(zeroRevenue.grossMarginPercent, null)
  assert.equal(zeroRevenue.reason, "zero_revenue")

  const missing = calculateGrossMargin({ revenueCents: Number.NaN, directCostCents: 1000 })
  assert.equal(missing.grossMarginPercent, null)
  assert.equal(missing.reason, "missing_input")

  const creditAdjusted = calculateGrossMargin({ revenueCents: -100000, directCostCents: -60000 })
  assert.equal(creditAdjusted.grossProfitCents, -40000)
  assert.equal(creditAdjusted.grossMarginPercent, 40)
  assert.equal(creditAdjusted.reason, "ok")
})

test("contribution margin is suppressed when completeness is too low", () => {
  const blocked = calculateContributionMargin({
    revenueCents: 100000,
    variableCostCents: 50000,
    completenessPercent: 62,
    minimumCompletenessPercent: 70,
  })
  assert.equal(blocked.available, false)
  assert.equal(blocked.reason, "insufficient_data")

  const allowed = calculateContributionMargin({
    revenueCents: 100000,
    variableCostCents: 50000,
    completenessPercent: 88,
    minimumCompletenessPercent: 70,
  })
  assert.equal(allowed.available, true)
  assert.equal(allowed.contributionMarginCents, 50000)
  assert.equal(allowed.contributionMarginPercent, 50)
})

test("required price rejects impossible target margins and computes expected output", () => {
  assert.throws(
    () => calculateRequiredPrice({ directCostCents: 70000, targetMarginPercent: 100 }),
    /Target margin must be greater than 0 and less than 100/,
  )
  assert.throws(
    () => calculateRequiredPrice({ directCostCents: -1, targetMarginPercent: 30 }),
    /Direct cost must be a finite non-negative number/,
  )

  const result = calculateRequiredPrice({ directCostCents: 70000, targetMarginPercent: 30, currentPriceCents: 95000 })
  assert.equal(result.requiredPriceCents, 100000)
  assert.equal(result.expectedGrossProfitCents, 30000)
  assert.equal(result.deltaFromCurrentPriceCents, 5000)
})

test("margin variance and scenario impact reflect deterministic deltas", () => {
  const variance = calculateMarginVariance(32.4, 35)
  assert.equal(variance, -2.6)

  const impact = calculateMarginImpact({
    revenueCents: 100000,
    directCostCents: 70000,
    directCostChangePercent: 5,
    priceChangePercent: 3,
    volumeChangePercent: 2,
  })

  assert.equal(impact.baseGrossProfitCents, 30000)
  assert.ok(impact.projectedGrossProfitCents !== impact.baseGrossProfitCents)
  assert.ok(impact.projectedGrossMarginPercent !== null)
})

test("data completeness and confidence bands provide actionable outputs", () => {
  const low = calculateDataCompleteness({
    revenueMappedPercent: 40,
    expenseClassifiedPercent: 45,
    directCostAssignedPercent: 42,
    customerMappedPercent: 60,
    productServiceMappedPercent: 30,
  })
  assert.equal(low.confidence, "insufficient_data")
  assert.ok(low.missingItems.length >= 3)

  const medium = calculateDataCompleteness({
    revenueMappedPercent: 90,
    expenseClassifiedPercent: 82,
    directCostAssignedPercent: 80,
    customerMappedPercent: 90,
    productServiceMappedPercent: 80,
  })
  assert.equal(medium.confidence, "medium")
})

test("status determination respects threshold ordering and confidence state", () => {
  validateMarginThresholds({ targetPercent: 35, warningPercent: 30, criticalPercent: 25 })

  const statusHealthy = determineMarginStatus({
    grossMarginPercent: 38,
    thresholds: { targetPercent: 35, warningPercent: 30, criticalPercent: 25 },
    confidence: "high",
  })
  assert.equal(statusHealthy, "healthy")

  const statusWarning = determineMarginStatus({
    grossMarginPercent: 28,
    thresholds: { targetPercent: 35, warningPercent: 30, criticalPercent: 25 },
    confidence: "medium",
  })
  assert.equal(statusWarning, "warning")

  const statusInsufficient = determineMarginStatus({
    grossMarginPercent: 38,
    thresholds: { targetPercent: 35, warningPercent: 30, criticalPercent: 25 },
    confidence: "insufficient_data",
  })
  assert.equal(statusInsufficient, "insufficient_data")

  assert.throws(
    () => validateMarginThresholds({ targetPercent: 30, warningPercent: 30, criticalPercent: 20 }),
    /critical < warning < target/,
  )
})
