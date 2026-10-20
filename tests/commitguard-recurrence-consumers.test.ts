import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import { CommitmentProjectionError } from "@/lib/commitguard/engine"
import type { CommitmentSnapshot, CommitGuardSettingsSnapshot } from "@/lib/commitguard/types"

const now = new Date("2026-10-19T12:00:00Z")
const settings: CommitGuardSettingsSnapshot = {
  enabled: true, defaultHorizonDays: 30,
  safetyBufferMode: "fixed_amount", safetyBufferFixedCents: 0, safetyBufferCurrency: null,
  safetyBufferPercent: null, safetyBufferWeeks: null, detectRecurringCommitments: false,
  detectionMinOccurrences: 3, detectionAmountVariancePercent: 12, detectionIntervalToleranceDays: 3,
  detectionConfidenceThreshold: "medium", alertCommitmentDueSoon: true, alertRenewalApproaching: true,
  alertNoticePeriodApproaching: true, alertCommitmentAmountChanged: true,
  alertCommitmentBufferLow: true, alertCommitmentShortfall: true, renewalWarningDays: [90, 60, 30, 14, 7],
}
const base: CommitmentSnapshot = {
  id: "commitment-1", userId: "tenant-a", name: "Recurring expense", description: null,
  category: "software", amountCents: 100, currency: "aud", frequency: "weekly",
  nextDueDate: new Date("1900-01-01Z"), startDate: null, endDate: null, recurrenceRule: null,
  supplierName: null, supplierId: null, accountId: null, source: "manual", status: "active",
  confidence: "confirmed", noticePeriodDays: null, renewalDate: null, autoRenew: false,
  cancellable: true, essentiality: "operational", notes: null, linkedSpendInsightId: null,
  linkedCostGuardAlertId: null, archivedAt: null, createdAt: now, updatedAt: now,
}
let rows: CommitmentSnapshot[] = []
let realSummarize: typeof import("@/lib/commitguard/service").summarizeCommitGuard
let savedCash: object | null = null
// Transition the numerical fixtures to persisted inputs. Overrides exist only
// in this test helper, never on the production service signature or GET route.
async function summarize(input: { userId: string; now: Date; cashAvailableCents: number | null;
  cashCurrency?: string | null; taxProtectedCashCents?: number; taxProtectionCurrency?: string;
  weeklyOperatingExpensesCents?: number; weeklyExpensesCurrency?: string; weeklyExpensesAsOf?: string }) {
  savedCash = { amountCents: input.cashCurrency ? input.cashAvailableCents : null,
    currency: input.cashCurrency ?? null, balanceAsOf: input.cashCurrency ? new Date("2026-10-19Z") : null,
    weeklyOperatingExpensesCents: input.weeklyExpensesAsOf ? input.weeklyOperatingExpensesCents ?? null : null,
    weeklyExpensesCurrency: input.weeklyExpensesAsOf ? input.weeklyExpensesCurrency ?? null : null,
    weeklyExpensesAsOf: input.weeklyExpensesAsOf ? new Date(input.weeklyExpensesAsOf) : null,
    taxProtectionCurrency: null, revision: 1 }
  return realSummarize({ userId: input.userId, now: input.now })
}
let list: typeof import("@/lib/commitguard/service").listCommitments
let loadProtection: typeof import("@/lib/commitguard/service").loadCommitGuardCommitmentProtection
const originalSettings = { ...settings }

describe("CommitGuard recurrence through existing real service consumers (offline)", () => {
  before(async () => {
    // All storage is a narrow read-only double. No real clients or API calls.
    await mock.module("@/lib/db/withUserContext", { namedExports: {
      withUserContext: async (tenant: string, callback: (tx: object) => Promise<unknown>) => {
        assert.equal(tenant, "tenant-a")
        return callback({
          commitment: { findMany: async ({ where }: { where: { userId: string } }) => {
            assert.equal(where.userId, tenant)
            return rows
          } },
          commitGuardSetting: { upsert: async ({ update }: { update: object }) => {
            assert.deepEqual(update, {})
            return settings
          }, findUnique: async () => ({ ...settings, calculationRevision: 0 }) },
          commitGuardCashContext: { findUnique: async () => savedCash },
          commitmentCoverage: { findMany: async () => [] },
          importedBill: { findMany: async () => [] },
          taxReserveCategory: { findMany: async () => [] },
          taxBufferObligation: { findMany: async () => [] },
        })
      },
    } })
    await mock.module("@/lib/billing", { namedExports: { requireFeature: async () => false } })
    await mock.module("@/lib/commitguard/entitlements", { namedExports: {
      requireCommitGuardCoreAccess: async (tenant: string) => { assert.equal(tenant, "tenant-a") },
      getCommitGuardEntitlements: async () => { throw new Error("unexpected alert evaluation") },
    } })
    await mock.module("@/lib/taxBuffer/service", { namedExports: {
      loadTaxBufferSummary: async () => { throw new Error("unexpected Tax Buffer call") },
    } })
    ;({ summarizeCommitGuard: realSummarize, listCommitments: list,
      loadCommitGuardCommitmentProtection: loadProtection } = await import("@/lib/commitguard/service"))
  })

  beforeEach(() => {
    Object.assign(settings, originalSettings)
    rows = [base]
  })

  test("same-currency legacy totals retain corrected values with explicitly tagged cash", async () => {
    rows = [base]
    // Obsolete expectation: untagged cash previously produced an AUD safety
    // assertion. Keep the numerical regression, but require currency evidence.
    const result = await summarize({ userId: "tenant-a", now, cashAvailableCents: 10_000, cashCurrency: "aud", taxProtectedCashCents: 0 })
    assert.deepEqual(result.horizons?.map((horizon) => [horizon.days, horizon.totalCents]), [
      [7, 100], [30, 500], [60, 900], [90, 1300],
    ])
    assert.equal(result.freeCash.committedCashCents, 500)
    assert.equal(result.freeCash.freeCashCents, 9500)
    assert.equal(result.freeCash.status, "safe")
  })

  test("actual snapshot mapping carries archivedAt so archived active rows cannot protect cash", async () => {
    rows = [{ ...base, archivedAt: new Date("2026-10-01Z") }, { ...base, id: "active-row" }]
    const listed = await list("tenant-a")
    assert.equal(listed[0].archivedAt?.toISOString(), "2026-10-01T00:00:00.000Z")
    const result = await summarize({ userId: "tenant-a", now, cashAvailableCents: 10_000, cashCurrency: "aud", taxProtectedCashCents: 0 })
    assert.equal(result.horizons?.[0].totalCents, 100)
  })

  test("unsupported projection rejects the real summary before it can assert a free-cash status", async () => {
    rows = [{ ...base, frequency: "custom" }]
    const result = await summarize({ userId: "tenant-a", now, cashAvailableCents: 10_000, taxProtectedCashCents: 0 })
    assert.ok(result.quality.reasons.includes("unsupported_recurrence"))
    assert.equal(result.freeCash.status, null)
  })

  test("grouped storage-backed service keeps AUD/USD and each confidence class separate", async () => {
    rows = ["aud", "usd"].flatMap((currency) => (["confirmed", "high", "medium", "low"] as const)
      .map((confidence, i) => ({ ...base, id: `${currency}-${confidence}`, currency, confidence,
        frequency: "one_off" as const, nextDueDate: now, amountCents: (i + 1) * 100 })))
    const result = await loadProtection({ userId: "tenant-a", now, cashCurrency: "aud" })
    assert.deepEqual(result.includedConfidenceClasses, ["confirmed", "probable", "potential"])
    assert.deepEqual(result.horizonsByCurrency.map((group) => [group.currency,
      group.horizons[1].totalCents, group.horizons[1].confirmedCents,
      group.horizons[1].probableCents, group.horizons[1].potentialCents]), [
      ["aud", 1000, 100, 500, 400], ["usd", 1000, 100, 500, 400],
    ])
    assert.deepEqual(result.excludedCurrencies, ["usd"])
    assert.equal(result.unavailableReason, "currency_mismatch")
    assert.equal(result.selectedCurrencyTotals?.totalCents, 1000)
    const summary = await summarize({ userId: "tenant-a", now, cashAvailableCents: 10_000, cashCurrency: "aud", taxProtectedCashCents: 0 })
    assert.equal(summary.horizons, null)
    assert.equal(summary.freeCash.status, null)
  })

  test("selected USD cash never chooses the first AUD group or hides excluded AUD", async () => {
    rows = [{ ...base, frequency: "one_off", nextDueDate: now, amountCents: 123 },
      { ...base, id: "usd", currency: "usd", frequency: "one_off", nextDueDate: now, amountCents: 456 }]
    const result = await loadProtection({ userId: "tenant-a", now, cashCurrency: "USD" })
    assert.equal(result.cashCurrency, "usd")
    assert.equal(result.selectedCurrencyTotals?.totalCents, 456)
    assert.deepEqual(result.excludedCurrencies, ["aud"])
    assert.equal(result.unavailableReason, "currency_mismatch")
  })

  test("configured 60-day free cash includes day 45 and all confidence classes; next-30 remains separate", async () => {
    rows = (["confirmed", "high", "medium", "low"] as const).map((confidence) => ({
      ...base, id: confidence, confidence, frequency: "one_off", amountCents: 1000,
      nextDueDate: new Date("2026-12-03Z"), // day 45 after October 19
    }))
    const input = { userId: "tenant-a", now, cashAvailableCents: 10_000, cashCurrency: "aud", taxProtectedCashCents: 0 }
    const thirty = await summarize(input)
    assert.equal(thirty.selectedHorizonDays, 30)
    assert.equal(thirty.freeCash.freeCashCents, 10_000)
    settings.defaultHorizonDays = 60
    const sixty = await summarize(input)
    assert.equal(sixty.selectedHorizonDays, 60)
    assert.equal(sixty.freeCash.committedCashCents, 4000)
    assert.equal(sixty.freeCash.freeCashCents, 6000)
    assert.equal(sixty.horizons?.find((h) => h.days === 30)?.totalCents, 0)
    assert.deepEqual(sixty.commitmentProtection.selectedCurrencyTotals, {
      days: 60, totalCents: 4000, confirmedCents: 1000, probableCents: 2000, potentialCents: 1000,
    })
  })

  test("percentage buffer uses compatible 30 days even when free cash protects 60 days", async () => {
    settings.defaultHorizonDays = 60
    settings.safetyBufferMode = "percentage_monthly_commitments"
    settings.safetyBufferPercent = 10
    rows = [{ ...base, frequency: "one_off", nextDueDate: now, amountCents: 1000 },
      { ...base, id: "day45", frequency: "one_off", nextDueDate: new Date("2026-12-03Z"), amountCents: 4000 }]
    const result = await summarize({ userId: "tenant-a", now, cashAvailableCents: 10_000, cashCurrency: "aud", taxProtectedCashCents: 0 })
    assert.equal(result.freeCash.committedCashCents, 5000)
    assert.equal(result.freeCash.safetyBufferCents, 100)
    assert.equal(result.freeCash.freeCashCents, 4900)
  })

  test("single USD is calculated only with explicit USD cash, never relabeled AUD", async () => {
    rows = [{ ...base, currency: "usd", frequency: "one_off", nextDueDate: now }]
    const result = await summarize({ userId: "tenant-a", now, cashAvailableCents: 1000, cashCurrency: "usd", taxProtectedCashCents: 0 })
    assert.equal(result.currency, "usd")
    assert.equal(result.freeCash.freeCashCents, 900)
    assert.equal((await summarize({ userId: "tenant-a", now, cashAvailableCents: 1000, taxProtectedCashCents: 0 })).freeCash.status, null)
  })

  test("legacy currency-less cash fails unavailable rather than inferring AUD from commitments", async () => {
    assert.equal((await summarize({ userId: "tenant-a", now, cashAvailableCents: 10_000, taxProtectedCashCents: 0 })).freeCash.status, null)
    const result = await loadProtection({ userId: "tenant-a", now, cashCurrency: null })
    assert.equal(result.unavailableReason, "cash_currency_missing")
    assert.equal(result.selectedCurrencyTotals, null)
  })

  test("unsupported stored currency remains visible but cannot produce free cash", async () => {
    rows = [{ ...base, currency: "jpy", frequency: "one_off", nextDueDate: now }]
    const result = await loadProtection({ userId: "tenant-a", now, cashCurrency: "aud" })
    assert.equal(result.horizonsByCurrency[0].currency, "jpy")
    assert.equal(result.horizonsByCurrency[0].supportedForFreeCash, false)
    assert.deepEqual(result.excludedCurrencies, ["jpy"])
    assert.equal(result.unavailableReason, "currency_mismatch")
    const summary = await realSummarize({ userId: "tenant-a", now })
    assert.equal(summary.horizons, null)
    assert.equal(summary.freeCash.status, null)
  })

  test("invalid persisted default horizon fails instead of silently falling back to 30", async () => {
    settings.defaultHorizonDays = 45
    await assert.rejects(loadProtection({ userId: "tenant-a", now, cashCurrency: "aud" }),
      (error: unknown) => error instanceof CommitmentProjectionError && error.code === "invalid_window")
  })

  test("positive incompatible fixed/tax protection cannot be combined with selected cash currency", async () => {
    settings.safetyBufferFixedCents = 500
    settings.safetyBufferCurrency = "aud"
    rows = [{ ...base, currency: "usd", frequency: "one_off", nextDueDate: now }]
    const input = { userId: "tenant-a", now, cashAvailableCents: 1000, cashCurrency: "usd", taxProtectedCashCents: 0 }
    assert.equal((await summarize(input)).freeCash.status, null)
    settings.safetyBufferFixedCents = 0
    // Legacy test helper tax arguments are not persisted tax facts and cannot
    // influence the new saved-input service.
    assert.equal((await summarize({ ...input, taxProtectedCashCents: 100, taxProtectionCurrency: "aud" })).freeCash.taxProtectedCashCents, 0)
  })

  test("legacy single-AUD missing-cash path remains missing, not fabricated zero cash", async () => {
    const result = await summarize({ userId: "tenant-a", now, cashAvailableCents: null, taxProtectedCashCents: 0 })
    assert.equal(result.freeCash.cashAvailableCents, null)
    assert.equal(result.freeCash.freeCashCents, null)
    assert.equal(result.currency, null)
    // Do not bless the old WATCH assertion: its nullable v2 replacement and
    // no-event guarantee remain task 3.7. This task introduces no alert writes.
  })

  test("legacy summary never turns missing or undated weekly expenses into a complete zero buffer", async () => {
    settings.safetyBufferMode = "weeks_operating_expenses"
    settings.safetyBufferWeeks = 4
    const input = { userId: "tenant-a", now, cashAvailableCents: 500000, cashCurrency: "aud", taxProtectedCashCents: 0 }
    for (const weeklyOperatingExpensesCents of [undefined, 0, 20000]) {
      assert.equal((await summarize({ ...input, weeklyOperatingExpensesCents, weeklyExpensesCurrency: "aud" })).freeCash.status, null)
    }
    const result = await summarize({ ...input, weeklyOperatingExpensesCents: 20000,
      weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-10-12" })
    assert.equal(result.freeCash.safetyBufferCents, 80000)
    assert.equal(result.freeCash.freeCashCents, 419500)
    assert.equal((await summarize({ ...input, weeklyOperatingExpensesCents: 20000,
      weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-10-11" })).freeCash.status, null)
  })
})