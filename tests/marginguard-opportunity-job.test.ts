import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { evaluateOpportunityCandidates } from "@/lib/marginguard/opportunityJob"

describe("MarginGuard opportunity evaluation", () => {
  test("creates pricing, cost reduction, and classification opportunities when signals indicate margin stress", () => {
    const candidates = evaluateOpportunityCandidates({
      targetGrossMarginPercent: 40,
      currentGrossMarginPercent: 28,
      revenueCents: 200000,
      directCostCents: 150000,
      completenessPercent: 78,
      unclassifiedCount: 30,
      openAlertCount: 5,
      spendLeakOpenFindingCount: 4,
      spendLeakEstimatedMonthlyCents: 25000,
      costGuardVarianceCents: 35000,
      commitmentDue30DaysCents: 40000,
      cashPlanBufferGapCents: 15000,
    })

    const types = new Set(candidates.map((candidate) => candidate.opportunityType))
    assert.equal(types.has("pricing"), true)
    assert.equal(types.has("cost_reduction"), true)
    assert.equal(types.has("classification"), true)
    assert.equal(types.has("customer_mix"), true)
    assert.equal(types.has("service_mix"), true)

    const customerMix = candidates.find((candidate) => candidate.opportunityType === "customer_mix")
    assert.equal(Boolean(customerMix), true)
    assert.deepEqual((customerMix?.evidence as { handoff?: { commitGuardPath: string; cashPlanPath: string } })?.handoff, {
      commitGuardPath: "/dashboard/commitguard",
      cashPlanPath: "/dashboard/settings/cash-plan",
    })

    const serviceMix = candidates.find((candidate) => candidate.opportunityType === "service_mix")
    assert.equal(serviceMix?.estimatedMonthlyCents, 60000)
  })

  test("returns no opportunities for healthy, complete margin snapshots", () => {
    const candidates = evaluateOpportunityCandidates({
      targetGrossMarginPercent: 35,
      currentGrossMarginPercent: 45,
      revenueCents: 200000,
      directCostCents: 100000,
      completenessPercent: 95,
      unclassifiedCount: 0,
      openAlertCount: 0,
      spendLeakOpenFindingCount: 0,
      spendLeakEstimatedMonthlyCents: 0,
      costGuardVarianceCents: 0,
      commitmentDue30DaysCents: 0,
      cashPlanBufferGapCents: 0,
    })

    assert.equal(candidates.length, 0)
  })
})
