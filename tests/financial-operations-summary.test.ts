import assert from "node:assert/strict"
import { test } from "node:test"
import { buildFinancialOperationsSummary } from "@/lib/dashboard/financialOperationsSummary"

test("combined summary with both receivables and spend data", () => {
  const model = buildFinancialOperationsSummary({
    activeInvoiceCount: 8,
    spendFindingCount: 5,
    hasSpendLeakAccess: true,
    hasAccountingConnection: true,
    latestSyncAt: new Date("2026-09-01T00:00:00.000Z"),
  })

  assert.equal(model.activeInvoiceCount, 8)
  assert.equal(model.spendFindingCount, 5)
  assert.equal(model.showUnlockCta, false)
  assert.match(model.spendStatusLabel, /Synced/)
})

test("receivables-only summary when SpendLeak is locked", () => {
  const model = buildFinancialOperationsSummary({
    activeInvoiceCount: 3,
    spendFindingCount: 7,
    hasSpendLeakAccess: false,
    hasAccountingConnection: false,
    latestSyncAt: null,
  })

  assert.equal(model.activeInvoiceCount, 3)
  assert.equal(model.spendFindingCount, 0)
  assert.equal(model.showUnlockCta, true)
  assert.equal(model.spendStatusLabel, "Locked")
})

test("initial-sync state when connection exists but no sync timestamp", () => {
  const model = buildFinancialOperationsSummary({
    activeInvoiceCount: 2,
    spendFindingCount: 0,
    hasSpendLeakAccess: true,
    hasAccountingConnection: true,
    latestSyncAt: null,
  })

  assert.equal(model.spendStatusLabel, "Initial sync pending")
})

test("forecast status is surfaced in the summary model for dashboard cards", () => {
  const model = buildFinancialOperationsSummary({
    activeInvoiceCount: 5,
    spendFindingCount: 3,
    hasSpendLeakAccess: true,
    hasAccountingConnection: true,
    latestSyncAt: new Date("2026-09-01T00:00:00.000Z"),
    costGuardForecast: {
      actualSpendCents: 150000,
      recurringCommitmentsCents: 40000,
      expectedVariableSpendCents: 30000,
      projectedMonthEndCents: 220000,
      varianceAmountCents: 40000,
      variancePercent: 22.22,
      confidence: 71,
    },
  })

  assert.equal(model.costGuardForecastStatus, "over_target")
  assert.equal(model.costGuardStatusLabel, "Over target")
  assert.match(model.costGuardForecastMessage ?? "", /above the expected baseline/i)
})
