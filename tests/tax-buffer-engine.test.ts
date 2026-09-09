import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  buildTaxBufferDigestSummary,
  buildTaxBufferSummary,
  computeTaxReserveCategory,
  evaluateTaxBufferHealth,
  type TaxReserveCategoryConfig,
} from "@/lib/taxBuffer/engine"

describe("Tax Buffer engine", () => {
  test("applies GST integration differently for cash and accrual basis", () => {
    const gstCategory: TaxReserveCategoryConfig = {
      id: "gst",
      type: "gst",
      name: "GST",
      enabled: true,
      method: "integration",
      recurrence: "quarterly",
    }

    const cashResult = computeTaxReserveCategory({
      category: gstCategory,
      accountingBasis: "cash",
      metrics: {
        availableCashCents: 1_000_000,
        committedOutflowsCents: 0,
        estimatedRevenueCents: 0,
        estimatedTaxableProfitCents: 0,
        gstCollectedCents: 55_000,
        gstCreditCents: 5_000,
        unpaidInvoiceGstCents: 12_000,
      },
      reservedCents: 20_000,
    })

    const accrualResult = computeTaxReserveCategory({
      category: gstCategory,
      accountingBasis: "accrual",
      metrics: {
        availableCashCents: 1_000_000,
        committedOutflowsCents: 0,
        estimatedRevenueCents: 0,
        estimatedTaxableProfitCents: 0,
        gstCollectedCents: 55_000,
        gstCreditCents: 5_000,
        unpaidInvoiceGstCents: 12_000,
      },
      reservedCents: 20_000,
    })

    assert.equal(cashResult.requiredReserveCents, 50_000)
    assert.equal(accrualResult.requiredReserveCents, 62_000)
    assert.equal(accrualResult.shortfallCents, 42_000)
  })

  test("computes percentage-based categories and safe-to-spend totals", () => {
    const summary = buildTaxBufferSummary({
      accountingBasis: "cash",
      thresholds: {
        watchRatio: 0.9,
        criticalRatio: 0.7,
      },
      metrics: {
        availableCashCents: 1_500_000,
        committedOutflowsCents: 250_000,
        estimatedRevenueCents: 2_000_000,
        estimatedTaxableProfitCents: 1_000_000,
        gstCollectedCents: 0,
        gstCreditCents: 0,
        unpaidInvoiceGstCents: 0,
      },
      categories: [
        {
          id: "income-tax",
          type: "income_tax",
          name: "Income Tax",
          enabled: true,
          method: "percentage_profit",
          ratePercent: 25,
          recurrence: "quarterly",
        },
      ],
      reservedByCategory: {
        "income-tax": 100_000,
      },
    })

    assert.equal(summary.totalRequiredReserveCents, 250_000)
    assert.equal(summary.totalReservedCents, 100_000)
    assert.equal(summary.reserveGapCents, 150_000)
    assert.equal(summary.safeToSpendCents, 1_000_000)
    assert.equal(summary.healthStatus, "critical")
    assert.ok(summary.recommendation.reasons[0]?.includes("shortfall"))
  })

  test("flags missing available cash and preserves null safe-to-spend", () => {
    const summary = buildTaxBufferSummary({
      accountingBasis: "cash",
      thresholds: {
        watchRatio: 0.9,
        criticalRatio: 0.7,
      },
      metrics: {
        availableCashCents: null,
        committedOutflowsCents: 0,
        estimatedRevenueCents: 100_000,
        estimatedTaxableProfitCents: 60_000,
        gstCollectedCents: 0,
        gstCreditCents: 0,
        unpaidInvoiceGstCents: 0,
      },
      categories: [
        {
          id: "income-tax",
          type: "income_tax",
          name: "Income Tax",
          enabled: true,
          method: "manual",
          manualAmountCents: 15_000,
          recurrence: "monthly",
        },
      ],
      reservedByCategory: {
        "income-tax": 0,
      },
    })

    assert.equal(summary.safeToSpendCents, null)
    assert.ok(summary.warnings.some((warning) => warning.includes("Available cash is missing")))
  })

  test("returns unknown for disabled categories and calculates no shortfall", () => {
    const result = computeTaxReserveCategory({
      category: {
        id: "payg",
        type: "payg_withholding",
        name: "PAYG",
        enabled: false,
        method: "manual",
        manualAmountCents: 12_000,
      },
      accountingBasis: "cash",
      metrics: {
        availableCashCents: 0,
        committedOutflowsCents: 0,
        estimatedRevenueCents: 0,
        estimatedTaxableProfitCents: 0,
        gstCollectedCents: 0,
        gstCreditCents: 0,
        unpaidInvoiceGstCents: 0,
      },
      reservedCents: 500,
    })

    assert.equal(result.requiredReserveCents, 0)
    assert.equal(result.shortfallCents, 0)
    assert.equal(result.confidence, "unknown")
    assert.equal(result.source, "disabled")
  })

  test("evaluates health thresholds deterministically", () => {
    assert.equal(
      evaluateTaxBufferHealth({
        requiredReserveCents: 100_000,
        reservedCents: 100_000,
        thresholds: { watchRatio: 0.9, criticalRatio: 0.7 },
      }),
      "healthy",
    )

    assert.equal(
      evaluateTaxBufferHealth({
        requiredReserveCents: 100_000,
        reservedCents: 85_000,
        thresholds: { watchRatio: 0.8, criticalRatio: 0.6 },
      }),
      "watch",
    )

    assert.equal(
      evaluateTaxBufferHealth({
        requiredReserveCents: 100_000,
        reservedCents: 65_000,
        thresholds: { watchRatio: 0.8, criticalRatio: 0.6 },
      }),
      "underfunded",
    )

    assert.equal(
      evaluateTaxBufferHealth({
        requiredReserveCents: 100_000,
        reservedCents: 30_000,
        thresholds: { watchRatio: 0.8, criticalRatio: 0.6 },
      }),
      "critical",
    )
  })

  test("builds a Tax Buffer digest summary with actionable guidance", () => {
    const digest = buildTaxBufferDigestSummary({
      period: "daily",
      userName: "Taylor",
      transferNowCents: 25_000,
      events: [
        {
          id: "evt-1",
          title: "Reserve below target",
          message: "Your reserve is short by 25,000 cents.",
          severity: "warning",
        },
        {
          id: "evt-2",
          title: "Obligation due soon",
          message: "Quarterly BAS is due next week.",
          severity: "critical",
        },
      ],
    })

    assert.equal(digest.count, 2)
    assert.ok(digest.headline.includes("Taylor"))
    assert.ok(digest.actions.some((action) => action.includes("Transfer")))
    assert.ok(digest.actions.some((action) => action.includes("critical reserve")))
  })
})
