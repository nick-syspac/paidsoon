import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { COMMIT_GUARD_CURRENCIES } from "@/lib/commitguard/cashContext"
import { buildCommitmentProtection, calculateFreeCashBreakdown, CommitmentProjectionError,
  resolveSafetyBufferCents, type CommitmentProtectionProjection } from "@/lib/commitguard/engine"
import { composeCommitGuardProtection, getCommitGuardProtectionQuality, resolveCommitGuardSafetyBuffer,
  type CommitGuardProtectionCashInput, type CommitGuardProtectionReason } from "@/lib/commitguard/protectionComposition"
import type { CommitGuardSettingsSnapshot, CommitmentSnapshot } from "@/lib/commitguard/types"

const now = new Date("2026-10-19T23:59:59Z")
const settings: CommitGuardSettingsSnapshot = {
  enabled: true, defaultHorizonDays: 60, safetyBufferMode: "weeks_operating_expenses",
  safetyBufferFixedCents: 50000, safetyBufferCurrency: "aud", safetyBufferWeeks: 4, safetyBufferPercent: 10,
  detectRecurringCommitments: false, detectionMinOccurrences: 3, detectionAmountVariancePercent: 12,
  detectionIntervalToleranceDays: 3, detectionConfidenceThreshold: "medium", alertCommitmentDueSoon: true,
  alertRenewalApproaching: true, alertNoticePeriodApproaching: true, alertCommitmentAmountChanged: true,
  alertCommitmentBufferLow: true, alertCommitmentShortfall: true, renewalWarningDays: [30, 7],
}
const cash: CommitGuardProtectionCashInput = {
  amountCents: 500000, currency: "aud", balanceAsOf: "2026-10-19",
  weeklyOperatingExpensesCents: 20000, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-10-12",
}
const projection = buildCommitmentProtection({ commitments: [], cashCurrency: "aud", selectedHorizonDays: 60, now })
const input = { settings, cashContext: cash, commitmentProtection: projection,
  taxProtection: { amountCents: 0, currency: null }, now }
function buffer(policy: Partial<CommitGuardSettingsSnapshot> = {}, basis: Partial<CommitGuardProtectionCashInput> = {},
  monthlyCommitmentsCents: number | null = 10000) {
  return resolveCommitGuardSafetyBuffer({ settings: { ...settings, ...policy },
    cashContext: { ...cash, ...basis }, monthlyCommitmentsCents, now })
}
function unavailable(result: ReturnType<typeof composeCommitGuardProtection>, reason: CommitGuardProtectionReason) {
  assert.ok(result.quality.reasons.includes(reason), JSON.stringify(result.quality))
  assert.equal(result.protectedCashCents, null)
  assert.equal(result.freeCashCents, null)
  assert.equal(result.status, null)
}
function occurrence(overrides: Partial<CommitmentSnapshot>): CommitmentSnapshot {
  return { id: "c1", userId: "unused", name: "Expense", description: null, category: "software",
    amountCents: 10000, currency: "aud", frequency: "one_off", nextDueDate: now, startDate: null, endDate: null,
    recurrenceRule: null, supplierName: null, supplierId: null, accountId: null, source: "manual", status: "active",
    confidence: "confirmed", noticePeriodDays: null, renewalDate: null, autoRenew: false, cancellable: true,
    essentiality: "operational", notes: null, linkedSpendInsightId: null, linkedCostGuardAlertId: null,
    createdAt: now, updatedAt: now, ...overrides }
}

describe("CommitGuard task 3.4 pure protection composition (offline)", () => {
  test("four times 20000 is 80000 and composes complete protection without mutating inputs", () => {
    const before = JSON.stringify(input)
    const result = composeCommitGuardProtection({ ...input, taxProtection: { amountCents: 12000, currency: "aud" } })
    assert.deepEqual(buffer(), { amountCents: 80000, quality: { state: "complete", reasons: [] } })
    assert.equal(result.safetyBufferCents, 80000)
    assert.equal(result.protectedCashCents, 92000)
    assert.equal(result.freeCashCents, 408000)
    assert.equal(result.status, "safe")
    assert.equal(result.quality.state, "complete")
    assert.equal(JSON.stringify(input), before)
  })

  for (const days of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`weekly expense freshness at UTC day ${days} is independent of fresh cash`, () => {
      const asOf = new Date(Date.UTC(2026, 9, 19 - days)).toISOString().slice(0, 10)
      const result = composeCommitGuardProtection({ ...input, cashContext: { ...cash, weeklyExpensesAsOf: asOf } })
      if (days <= 7) assert.equal(result.quality.state, "complete")
      else { unavailable(result, "weekly_expenses_stale"); assert.equal(result.quality.state, "stale") }
    })
  }

  test("cash day seven/day eight is independently evaluated, even with today's expense date", () => {
    for (const [balanceAsOf, complete] of [["2026-10-12", true], ["2026-10-11", false]] as const) {
      const result = composeCommitGuardProtection({ ...input, cashContext: {
        ...cash, balanceAsOf, weeklyExpensesAsOf: "2026-10-19",
      } })
      if (complete) assert.equal(result.quality.state, "complete")
      else unavailable(result, "cash_stale")
    }
  })

  for (const field of ["weeklyOperatingExpensesCents", "weeklyExpensesCurrency", "weeklyExpensesAsOf"] as const) {
    test(`missing ${field} is not zero even when weeks are explicitly zero`, () => {
      for (const safetyBufferWeeks of [0, 4]) {
        const result = buffer({ safetyBufferWeeks }, { [field]: null })
        assert.equal(result.amountCents, null)
        assert.ok(result.quality.reasons.includes("weekly_expenses_missing"))
      }
    })
  }

  test("missing weeks/percent/monthly basis are unavailable, distinct from explicit zero", () => {
    assert.deepEqual(buffer({ safetyBufferWeeks: null }).quality.reasons, ["buffer_weeks_missing"])
    assert.equal(buffer({ safetyBufferWeeks: 0 }).amountCents, 0)
    assert.equal(buffer({}, { weeklyOperatingExpensesCents: 0 }).amountCents, 0)
    const percentage = { safetyBufferMode: "percentage_monthly_commitments" as const }
    assert.deepEqual(buffer({ ...percentage, safetyBufferPercent: null }).quality.reasons, ["buffer_percent_missing"])
    assert.deepEqual(buffer(percentage, {}, null).quality.reasons, ["monthly_commitments_missing"])
    assert.equal(buffer({ ...percentage, safetyBufferPercent: 0 }).amountCents, 0)
    assert.equal(buffer(percentage, {}, 0).amountCents, 0)
  })

  test("explicit zero expense basis still requires fresh same-currency dating", () => {
    for (const [patch, reason] of [
      [{ weeklyExpensesAsOf: "2026-10-11" }, "weekly_expenses_stale"],
      [{ weeklyExpensesCurrency: "usd" }, "weekly_expenses_currency_mismatch"],
    ] as const) {
      const result = buffer({}, { weeklyOperatingExpensesCents: 0, ...patch })
      assert.equal(result.amountCents, null)
      assert.ok(result.quality.reasons.includes(reason))
    }
  })

  test("positive legacy fixed amount needs review, tagged mismatch does not relabel money, zero is neutral", () => {
    const fixed = { safetyBufferMode: "fixed_amount" as const }
    for (const safetyBufferCurrency of [null, undefined]) {
      assert.deepEqual(buffer({ ...fixed, safetyBufferCurrency }).quality.reasons, ["fixed_buffer_currency_review_required"])
    }
    assert.equal(buffer(fixed).amountCents, 50000)
    assert.deepEqual(buffer(fixed, { currency: "usd" }).quality.reasons, ["fixed_buffer_currency_mismatch"])
    assert.deepEqual(buffer({ ...fixed, safetyBufferCurrency: "jpy" }).quality.reasons, ["fixed_buffer_currency_unsupported"])
    for (const safetyBufferCurrency of [null, "usd", "jpy"]) {
      assert.equal(buffer({ ...fixed, safetyBufferFixedCents: 0, safetyBufferCurrency }).amountCents, 0)
    }
  })

  test("inactive buffer settings and stale expenses cannot contaminate fixed/percentage policies", () => {
    const unused = { weeklyOperatingExpensesCents: null, weeklyExpensesAsOf: "2020-01-01", weeklyExpensesCurrency: "jpy" }
    assert.equal(buffer({ safetyBufferMode: "fixed_amount", safetyBufferWeeks: null }, unused).amountCents, 50000)
    assert.equal(buffer({ safetyBufferMode: "percentage_monthly_commitments", safetyBufferCurrency: "jpy" }, unused).amountCents, 1000)
  })

  for (const date of ["2026-10-20", "2026-02-30", "2026-10-19T00:00:00Z", "not-a-date"]) {
    test(`invalid or future attestation ${date} produces an explicit unavailable reason`, () => {
      unavailable(composeCommitGuardProtection({ ...input, cashContext: { ...cash, weeklyExpensesAsOf: date } }), "weekly_expenses_date_invalid")
      unavailable(composeCommitGuardProtection({ ...input, cashContext: { ...cash, balanceAsOf: date } }), "cash_date_invalid")
    })
  }

  test("all eight currencies compose without FX and unsupported/mismatched bases remain unavailable", () => {
    for (const currency of COMMIT_GUARD_CURRENCIES) {
      const result = composeCommitGuardProtection({ ...input,
        cashContext: { ...cash, currency, weeklyExpensesCurrency: currency },
        commitmentProtection: buildCommitmentProtection({ commitments: [], selectedHorizonDays: 60, cashCurrency: currency, now }),
      })
      assert.equal(result.quality.state, "complete")
      assert.equal(result.freeCashCents, 420000)
    }
    unavailable(composeCommitGuardProtection({ ...input, cashContext: { ...cash, weeklyExpensesCurrency: "jpy" } }), "weekly_expenses_currency_unsupported")
    unavailable(composeCommitGuardProtection({ ...input, cashContext: { ...cash, weeklyExpensesCurrency: "usd" } }), "weekly_expenses_currency_mismatch")
    unavailable(composeCommitGuardProtection({ ...input, cashContext: { ...cash, currency: "jpy" } }), "unsupported_currency")
  })

  test("selected 60-day total includes day 45 but percentage buffer remains the conservative 30-day total", () => {
    const commitments = [occurrence({ amountCents: 10000, confidence: "low" }),
      occurrence({ id: "day45", amountCents: 40000, nextDueDate: new Date("2026-12-03Z"), confidence: "medium" })]
    for (const [selectedHorizonDays, protectedCashCents] of [[30, 11000], [60, 51000]] as const) {
      const result = composeCommitGuardProtection({ ...input,
        settings: { ...settings, safetyBufferMode: "percentage_monthly_commitments" },
        commitmentProtection: buildCommitmentProtection({ commitments, selectedHorizonDays, cashCurrency: "aud", now }),
      })
      assert.equal(result.safetyBufferCents, 1000)
      assert.equal(result.protectedCashCents, protectedCashCents)
      assert.equal(result.freeCashCents, 500000 - protectedCashCents)
    }
  })

  test("foreign commitments never consolidate, including percentage-only 30-day foreign obligations", () => {
    const foreign = occurrence({ currency: "usd", amountCents: 10000, nextDueDate: new Date("2026-11-01Z") })
    for (const selectedHorizonDays of [7, 30, 60] as const) {
      const commitmentProtection = buildCommitmentProtection({ commitments: [foreign], cashCurrency: "aud", selectedHorizonDays, now })
      unavailable(composeCommitGuardProtection({ ...input, commitmentProtection,
        settings: { ...settings, safetyBufferMode: "percentage_monthly_commitments" } }), "currency_mismatch")
    }
  })

  test("cash missing is never a safety assertion; explicitly saved zero and negative balances are known", () => {
    unavailable(composeCommitGuardProtection({ ...input, cashContext: { ...cash, amountCents: null } }), "cash_missing")
    for (const amountCents of [0, -1, -100]) {
      const result = composeCommitGuardProtection({ ...input, cashContext: { ...cash, amountCents } })
      assert.equal(result.quality.state, "complete")
      assert.equal(result.status, "shortfall")
    }
  })

  test("explicit tax zero is neutral; unknown/incompatible tax facts cannot masquerade as complete", () => {
    for (const [taxProtection, reason] of [
      [{ amountCents: null, currency: null }, "tax_protection_missing"],
      [{ amountCents: 100, currency: null }, "tax_protection_currency_missing"],
      [{ amountCents: 100, currency: "usd" }, "tax_protection_currency_mismatch"],
      [{ amountCents: 100, currency: "jpy" }, "tax_protection_currency_unsupported"],
    ] as const) unavailable(composeCommitGuardProtection({ ...input, taxProtection }), reason)
    assert.equal(composeCommitGuardProtection(input).quality.state, "complete")
  })

  test("quality keeps multiple reasons and has disabled/missing/stale/currency/incomplete precedence", () => {
    const reasons: CommitGuardProtectionReason[] = ["amount_overflow", "currency_mismatch", "weekly_expenses_stale", "cash_missing", "module_disabled"]
    for (const state of ["disabled", "missing", "stale", "unsupported_currency", "incomplete", "complete"]) {
      const quality = getCommitGuardProtectionQuality([...reasons, ...reasons])
      assert.equal(quality.state, state)
      assert.deepEqual(quality.reasons, reasons)
      reasons.pop()
    }
    unavailable(composeCommitGuardProtection({ ...input, settings: { ...settings, enabled: false } }), "module_disabled")
    unavailable(composeCommitGuardProtection({ ...input, reasons: ["unsupported_recurrence"] }), "unsupported_recurrence")
  })

  test("invalid configuration and cents fail closed, not clamp/coerce/round malformed cents", () => {
    for (const value of [-1, NaN, Infinity, -Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER, 0.5]) {
      assert.equal(buffer({}, { weeklyOperatingExpensesCents: value }).amountCents, null)
      assert.equal(buffer({ safetyBufferMode: "fixed_amount", safetyBufferFixedCents: value }).amountCents, null)
      assert.equal(buffer({ safetyBufferMode: "percentage_monthly_commitments" }, {}, value).amountCents, null)
    }
    for (const value of [-1, NaN, Infinity, 25]) assert.equal(buffer({ safetyBufferWeeks: value }).amountCents, null)
    for (const value of [-1, NaN, Infinity, 101]) {
      assert.equal(buffer({ safetyBufferMode: "percentage_monthly_commitments", safetyBufferPercent: value }).amountCents, null)
    }
    for (const amountCents of [NaN, Infinity, 0.1, -2_147_483_649, 2_147_483_648]) {
      unavailable(composeCommitGuardProtection({ ...input, cashContext: { ...cash, amountCents } }), "cash_amount_invalid")
    }
  })

  test("fractional weeks/percent round the final valid monetary result to integer cents", () => {
    assert.equal(buffer({ safetyBufferWeeks: 1.25 }, { weeklyOperatingExpensesCents: 101 }).amountCents, 126)
    assert.equal(buffer({ safetyBufferMode: "percentage_monthly_commitments", safetyBufferPercent: 2.5 }, {}, 101).amountCents, 3)
  })

  test("Prisma Int boundaries: product, aggregate and subtraction overflow never assert status", () => {
    const max = 2_147_483_647
    assert.equal(buffer({ safetyBufferWeeks: 1 }, { weeklyOperatingExpensesCents: max }).amountCents, max)
    assert.deepEqual(buffer({ safetyBufferWeeks: 2 }, { weeklyOperatingExpensesCents: max }).quality.reasons, ["amount_overflow"])
    const large = { ...input, settings: { ...settings, safetyBufferMode: "fixed_amount" as const, safetyBufferFixedCents: max } }
    assert.equal(composeCommitGuardProtection(large).protectedCashCents, max)
    unavailable(composeCommitGuardProtection({ ...large, taxProtection: { amountCents: 1, currency: "aud" } }), "amount_overflow")
    unavailable(composeCommitGuardProtection({ ...input, cashContext: { ...cash, amountCents: -2_147_483_648 } }), "amount_overflow")
    const neutral = { ...input, settings: { ...settings, safetyBufferMode: "fixed_amount" as const, safetyBufferFixedCents: 0 } }
    assert.equal(composeCommitGuardProtection({ ...neutral, cashContext: { ...cash, amountCents: -2_147_483_648 } }).freeCashCents, -2_147_483_648)
  })

  for (const [free, bufferCents, expected] of [
    [-1, 100, "shortfall"], [0, 100, "at_risk"], [25, 100, "at_risk"], [26, 100, "watch"],
    [100, 100, "watch"], [101, 100, "safe"], [0, 0, "at_risk"], [1, 0, "safe"],
    [1, 3, "watch"], [1, 4, "at_risk"],
  ] as const) {
    test(`complete thresholds: free ${free}, buffer ${bufferCents} => ${expected}`, () => {
      const result = composeCommitGuardProtection({ ...input,
        settings: { ...settings, safetyBufferMode: "fixed_amount", safetyBufferFixedCents: bufferCents },
        cashContext: { ...cash, amountCents: bufferCents + free },
      })
      assert.equal(result.quality.state, "complete")
      assert.equal(result.status, expected)
      assert.equal(calculateFreeCashBreakdown({ cashAvailableCents: bufferCents + free,
        committedCashCents: 0, taxProtectedCashCents: 0, safetyBufferCents: bufferCents }).status, expected)
    })
  }

  test("legacy weekly resolver refuses explicit undated/missing calls instead of returning a false complete zero", () => {
    for (const weeklyOperatingExpensesCents of [undefined, 0, 20000]) {
      assert.throws(() => resolveSafetyBufferCents({ settings, cashCurrency: "aud", monthlyCommitmentsCents: 0,
        weeklyOperatingExpensesCents, weeklyExpensesCurrency: "aud", now }),
      (error: unknown) => error instanceof CommitmentProjectionError && error.code === "buffer_inputs_unavailable")
    }
    assert.equal(resolveSafetyBufferCents({ settings, monthlyCommitmentsCents: 0, cashCurrency: "aud",
      weeklyOperatingExpensesCents: 20000, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-10-12", now }), 80000)
  })

  test("legacy free-cash arithmetic rejects invalid and overflow amounts", () => {
    const base = { cashAvailableCents: 0, committedCashCents: 0, taxProtectedCashCents: 0, safetyBufferCents: 0 }
    for (const field of Object.keys(base)) for (const value of [NaN, Infinity, 0.5]) {
      assert.throws(() => calculateFreeCashBreakdown({ ...base, [field]: value }), CommitmentProjectionError)
    }
    assert.throws(() => calculateFreeCashBreakdown({ ...base, committedCashCents: 2_147_483_647, safetyBufferCents: 1 }), CommitmentProjectionError)
    assert.throws(() => calculateFreeCashBreakdown({ ...base, cashAvailableCents: -2_147_483_648, safetyBufferCents: 1 }), CommitmentProjectionError)
  })

  test("mismatched projection context is not reused as a compatible total", () => {
    const commitmentProtection: CommitmentProtectionProjection = { ...projection, cashCurrency: "usd" }
    unavailable(composeCommitGuardProtection({ ...input, commitmentProtection }), "currency_mismatch")
  })
})