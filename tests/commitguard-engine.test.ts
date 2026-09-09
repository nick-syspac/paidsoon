import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  assessRenewalSeverity,
  buildCommitmentHorizonTotals,
  buildRenewalAssessments,
  calculateFreeCashBreakdown,
  projectCommitmentOccurrences,
  resolveSafetyBufferCents,
} from "@/lib/commitguard/engine"
import type { CommitmentSnapshot, CommitGuardSettingsSnapshot } from "@/lib/commitguard/types"

function buildCommitment(input: Partial<CommitmentSnapshot>): CommitmentSnapshot {
  return {
    id: input.id ?? "commitment-1",
    userId: input.userId ?? "user-1",
    name: input.name ?? "Software subscription",
    description: input.description ?? null,
    category: input.category ?? "software",
    amountCents: input.amountCents ?? 25_000,
    currency: input.currency ?? "aud",
    frequency: input.frequency ?? "monthly",
    nextDueDate: input.nextDueDate ?? new Date("2026-09-01T00:00:00.000Z"),
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    recurrenceRule: input.recurrenceRule ?? null,
    supplierName: input.supplierName ?? null,
    supplierId: input.supplierId ?? null,
    accountId: input.accountId ?? null,
    source: input.source ?? "manual",
    status: input.status ?? "active",
    confidence: input.confidence ?? "confirmed",
    noticePeriodDays: input.noticePeriodDays ?? null,
    renewalDate: input.renewalDate ?? null,
    autoRenew: input.autoRenew ?? false,
    cancellable: input.cancellable ?? true,
    essentiality: input.essentiality ?? "operational",
    notes: input.notes ?? null,
    linkedSpendInsightId: input.linkedSpendInsightId ?? null,
    linkedCostGuardAlertId: input.linkedCostGuardAlertId ?? null,
    createdAt: input.createdAt ?? new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-08-01T00:00:00.000Z"),
  }
}

describe("CommitGuard engine", () => {
  test("projects recurring monthly occurrences with day-of-month clamping", () => {
    const commitment = buildCommitment({
      frequency: "monthly",
      nextDueDate: new Date("2028-01-31T00:00:00.000Z"),
    })

    const occurrences = projectCommitmentOccurrences({
      commitment,
      windowStart: new Date("2028-01-01T00:00:00.000Z"),
      windowEnd: new Date("2028-03-31T00:00:00.000Z"),
    })

    assert.equal(occurrences.length, 3)
    assert.equal(occurrences[0].dueDate.toISOString().slice(0, 10), "2028-01-31")
    assert.equal(occurrences[1].dueDate.toISOString().slice(0, 10), "2028-02-29")
    assert.equal(occurrences[2].dueDate.toISOString().slice(0, 10), "2028-03-29")
  })

  test("aggregates horizons with confidence partitions", () => {
    const commitments = [
      buildCommitment({ id: "c1", amountCents: 10_000, confidence: "confirmed", frequency: "one_off" }),
      buildCommitment({ id: "c2", amountCents: 20_000, confidence: "high", frequency: "one_off" }),
      buildCommitment({ id: "c3", amountCents: 30_000, confidence: "low", frequency: "one_off" }),
    ]

    const horizons = buildCommitmentHorizonTotals({
      commitments,
      now: new Date("2026-09-01T00:00:00.000Z"),
      horizons: [7],
    })

    assert.equal(horizons.length, 1)
    assert.equal(horizons[0].totalCents, 60_000)
    assert.equal(horizons[0].confirmedCents, 10_000)
    assert.equal(horizons[0].probableCents, 20_000)
    assert.equal(horizons[0].potentialCents, 30_000)
  })

  test("computes free-cash states deterministically", () => {
    const safe = calculateFreeCashBreakdown({
      cashAvailableCents: 500_000,
      committedCashCents: 100_000,
      taxProtectedCashCents: 100_000,
      safetyBufferCents: 50_000,
    })

    const watch = calculateFreeCashBreakdown({
      cashAvailableCents: 260_000,
      committedCashCents: 100_000,
      taxProtectedCashCents: 100_000,
      safetyBufferCents: 50_000,
    })

    const shortfall = calculateFreeCashBreakdown({
      cashAvailableCents: 220_000,
      committedCashCents: 100_000,
      taxProtectedCashCents: 100_000,
      safetyBufferCents: 50_000,
    })

    assert.equal(safe.status, "safe")
    assert.equal(watch.status, "at_risk")
    assert.equal(shortfall.status, "shortfall")
  })

  test("derives renewal severities from warning windows", () => {
    const severity = assessRenewalSeverity({
      renewalDate: new Date("2026-10-15T00:00:00.000Z"),
      noticePeriodDays: 30,
      now: new Date("2026-09-20T00:00:00.000Z"),
      warningDays: [30, 14, 7],
    })

    assert.equal(severity, "urgent")
  })

  test("builds sorted renewal assessments", () => {
    const renewals = buildRenewalAssessments({
      now: new Date("2026-09-01T00:00:00.000Z"),
      commitments: [
        buildCommitment({
          id: "late",
          name: "Later renewal",
          renewalDate: new Date("2026-12-01T00:00:00.000Z"),
          noticePeriodDays: 30,
        }),
        buildCommitment({
          id: "soon",
          name: "Soon renewal",
          renewalDate: new Date("2026-10-01T00:00:00.000Z"),
          noticePeriodDays: 15,
        }),
      ],
    })

    assert.equal(renewals.length, 2)
    assert.equal(renewals[0].commitmentId, "soon")
    assert.ok(renewals[0].noticeCloseDate <= renewals[1].noticeCloseDate)
  })

  test("resolves safety buffer strategies", () => {
    const fixedSettings: CommitGuardSettingsSnapshot = {
      enabled: true,
      defaultHorizonDays: 30,
      safetyBufferMode: "fixed_amount",
      safetyBufferFixedCents: 40_000,
      safetyBufferPercent: null,
      safetyBufferWeeks: null,
      detectRecurringCommitments: true,
      detectionMinOccurrences: 3,
      detectionAmountVariancePercent: 12,
      detectionIntervalToleranceDays: 3,
      detectionConfidenceThreshold: "medium",
      alertCommitmentDueSoon: true,
      alertRenewalApproaching: true,
      alertNoticePeriodApproaching: true,
      alertCommitmentAmountChanged: true,
      alertCommitmentBufferLow: true,
      alertCommitmentShortfall: true,
      renewalWarningDays: [90, 60, 30, 14, 7],
    }

    const percentSettings: CommitGuardSettingsSnapshot = {
      ...fixedSettings,
      safetyBufferMode: "percentage_monthly_commitments",
      safetyBufferPercent: 20,
    }

    assert.equal(
      resolveSafetyBufferCents({
        settings: fixedSettings,
        monthlyCommitmentsCents: 300_000,
        weeklyOperatingExpensesCents: 0,
      }),
      40_000,
    )

    assert.equal(
      resolveSafetyBufferCents({
        settings: percentSettings,
        monthlyCommitmentsCents: 300_000,
        weeklyOperatingExpensesCents: 0,
      }),
      60_000,
    )
  })
})
