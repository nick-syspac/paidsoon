import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { evaluateMarginAlertCandidates } from "@/lib/marginguard/alertJob"

describe("MarginGuard alert evaluation", () => {
  test("emits warning/critical/data-quality alerts for breached thresholds", () => {
    const candidates = evaluateMarginAlertCandidates(
      {
        userId: "user-1",
        targetGrossMarginPercent: 40,
        warningGrossMarginPercent: 35,
        criticalGrossMarginPercent: 30,
        minCompletenessPercent: 75,
        alertBelowWarning: true,
        alertBelowCritical: true,
        alertDeterioration: true,
        alertNegativeMargin: true,
        alertCustomerMarginWarning: true,
        alertCostIncrease: true,
        alertDataQualityWarning: true,
      },
      {
        id: "snap-2",
        userId: "user-1",
        periodGranularity: "monthly",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-30T00:00:00.000Z"),
        revenueCents: 100000,
        directCostCents: 76000,
        grossMarginPercent: 24,
        completenessPercent: 60,
      },
      {
        id: "snap-1",
        userId: "user-1",
        periodGranularity: "monthly",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2026-08-31T00:00:00.000Z"),
        revenueCents: 100000,
        directCostCents: 60000,
        grossMarginPercent: 40,
        completenessPercent: 90,
      },
    )

    const alertTypes = new Set(candidates.map((candidate) => candidate.alertType))
    assert.equal(alertTypes.has("margin.below_critical"), true)
    assert.equal(alertTypes.has("margin.below_warning"), true)
    assert.equal(alertTypes.has("margin.deterioration"), true)
    assert.equal(alertTypes.has("cost.increase"), true)
    assert.equal(alertTypes.has("data.quality"), true)
    assert.equal(alertTypes.has("customer.margin_warning"), true)
  })

  test("does not emit threshold alerts when values are healthy", () => {
    const candidates = evaluateMarginAlertCandidates(
      {
        userId: "user-2",
        targetGrossMarginPercent: 35,
        warningGrossMarginPercent: 30,
        criticalGrossMarginPercent: 25,
        minCompletenessPercent: 70,
        alertBelowWarning: true,
        alertBelowCritical: true,
        alertDeterioration: true,
        alertNegativeMargin: true,
        alertCustomerMarginWarning: true,
        alertCostIncrease: true,
        alertDataQualityWarning: true,
      },
      {
        id: "snap-healthy",
        userId: "user-2",
        periodGranularity: "monthly",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        periodEnd: new Date("2026-09-30T00:00:00.000Z"),
        revenueCents: 100000,
        directCostCents: 55000,
        grossMarginPercent: 45,
        completenessPercent: 88,
      },
      null,
    )

    assert.equal(candidates.length, 0)
  })
})
