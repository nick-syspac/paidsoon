import test from "node:test"
import assert from "node:assert/strict"

import {
  assessCommitmentRunwayImpact,
  assessMarginGuardRunwayAdjustment,
  assessReceivablesReliability,
  assessSavingsImpact,
  assessTaxBufferProtectedCash,
} from "@/lib/runwayGuard/integrations"

test("receivables reliability reduces weight when disputed and overdue inflows dominate", () => {
  const result = assessReceivablesReliability({
    totalReceivablesCents: 1_000_000,
    disputedCents: 350_000,
    overdue30To60Cents: 250_000,
    overdue60PlusCents: 200_000,
    brokenPromisesCount: 3,
    activePromisesCount: 1,
    highConfidenceReceivablesCents: 100_000,
  })

  assert.ok(result.reliabilityMultiplier < 1)
  assert.ok(result.reliabilityMultiplier < 0.9)
  assert.ok(result.summary.toLowerCase().includes("disputed"))
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("overdue")))
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("promise")))
})

test("tax buffer reserve is excluded from usable cash unless explicitly overridden", () => {
  const result = assessTaxBufferProtectedCash({
    requiredReserveCents: 250_000,
    reservedCents: 200_000,
    healthStatus: "watch",
    enabled: true,
    allowOverride: false,
  })

  assert.equal(result.protectedCashCents, 250_000)
  assert.equal(result.excludedFromUsableCash, true)
  assert.ok(result.summary.toLowerCase().includes("excluded"))
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("reserve")))
})

test("identified savings are reported as potential runway improvements, not confirmed cash gains", () => {
  const result = assessSavingsImpact({
    identifiedMonthlyCents: 90_000,
    plannedMonthlyCents: 35_000,
    realizedMonthlyCents: 20_000,
    runwayDays: 45,
    dailyBurnCents: 25_000,
  })

  assert.ok(result.estimatedRunwayDaysImprovement > 0)
  assert.ok(result.potentialCents > result.realizedCents)
  assert.ok(result.summary.toLowerCase().includes("identified") || result.summary.toLowerCase().includes("potential"))
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("identified")))
})

test("commitment pre-approval reports current and post-commitment runway before approval", () => {
  const result = assessCommitmentRunwayImpact({
    currentRunwayDays: 90,
    usableCashCents: 1_200_000,
    proposedCommitmentCents: 300_000,
    dailyBurnCents: 25_000,
    warningThresholdDays: 60,
    criticalThresholdDays: 30,
  })

  assert.equal(result.currentRunwayDays, 90)
  assert.ok(result.postCommitmentRunwayDays < result.currentRunwayDays)
  assert.ok(result.deltaRunwayDays < 0)
  assert.ok(result.riskStatus === "warning" || result.riskStatus === "critical")
  assert.ok(result.summary.toLowerCase().includes("commitment"))
})

test("margin guard deterioration is translated into a runway adjustment without recomputing margin logic", () => {
  const result = assessMarginGuardRunwayAdjustment({
    currentRunwayDays: 120,
    usableCashCents: 2_000_000,
    grossMarginPercent: 32,
    targetMarginPercent: 40,
    projectedMarginPercent: 24,
    dailyBurnCents: 25_000,
  })

  assert.equal(result.currentRunwayDays, 120)
  assert.ok(result.adjustedRunwayDays < result.currentRunwayDays)
  assert.ok(result.deltaRunwayDays < 0)
  assert.ok(result.summary.toLowerCase().includes("margin"))
  assert.ok(result.reasons.some((reason) => reason.toLowerCase().includes("margin")))
})
