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
