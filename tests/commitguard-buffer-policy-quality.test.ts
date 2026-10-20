import assert from "node:assert/strict"
import { test } from "node:test"
import { getCommitGuardBufferPolicyReasons as reasons } from "@/lib/commitguard/bufferPolicyQuality"
import { COMMIT_GUARD_CURRENCIES, toCommitGuardCashContextDto } from "@/lib/commitguard/cashContext"
import { CommitGuardSettingsSchema } from "@/lib/commitguard/settingsSchema"

const now = new Date("2026-10-19T23:59:59Z")
const cash = {
  currency: "usd" as const,
  weeklyOperatingExpensesCents: 20000,
  weeklyExpensesCurrency: "aud" as const,
  weeklyExpensesAsOf: "2026-10-12",
}
const fixed = { safetyBufferMode: "fixed_amount" as const, safetyBufferFixedCents: 50000 }
const weeks = { ...fixed, safetyBufferMode: "weeks_operating_expenses" as const }

test("positive legacy fixed buffers require review, never the current cash currency", () => {
  for (const currency of [undefined, null]) {
    assert.deepEqual(reasons({ ...fixed, safetyBufferCurrency: currency }, cash, now), ["fixed_buffer_currency_review_required"])
  }
  assert.deepEqual(reasons({ ...fixed, safetyBufferCurrency: "jpy" }, cash, now), ["fixed_buffer_currency_unsupported"])
  assert.deepEqual(reasons({ ...fixed, safetyBufferCurrency: "aud" }, cash, now), ["fixed_buffer_currency_mismatch"])
  assert.deepEqual(reasons({ ...fixed, safetyBufferCurrency: "usd" }, cash, now), [])
})

test("explicit fixed zero is currency-neutral including unknown or mismatching saved currency", () => {
  for (const currency of [undefined, null, "aud", "jpy"]) {
    assert.deepEqual(reasons({ ...fixed, safetyBufferFixedCents: 0, safetyBufferCurrency: currency }, cash, now), [])
  }
})

test("weekly eligibility uses the saved expense date: day seven fresh, day eight stale with independent mismatch", () => {
  assert.deepEqual(reasons(weeks, cash, now), ["weekly_expenses_currency_mismatch"])
  assert.deepEqual(reasons(weeks, { ...cash, currency: "aud" }, now), [])
  const dayEight = new Date("2026-10-20T00:00:00Z")
  assert.deepEqual(reasons(weeks, cash, dayEight), ["weekly_expenses_stale", "weekly_expenses_currency_mismatch"])
  assert.deepEqual(reasons(weeks, { ...cash, currency: "aud" }, dayEight), ["weekly_expenses_stale"])
})

test("missing weekly basis is not zero; explicit zero still needs a fresh same-currency attestation", () => {
  assert.deepEqual(reasons(weeks, { ...cash, weeklyOperatingExpensesCents: null }, now), ["weekly_expenses_missing"])
  assert.deepEqual(reasons(weeks, { ...cash, weeklyExpensesAsOf: null }, now), ["weekly_expenses_missing"])
  assert.deepEqual(reasons(weeks, { ...cash, weeklyOperatingExpensesCents: 0, currency: "aud" }, now), [])
  assert.deepEqual(reasons(weeks, { ...cash, weeklyOperatingExpensesCents: 0 }, now), ["weekly_expenses_currency_mismatch"])
  assert.deepEqual(reasons(weeks, toCommitGuardCashContextDto(null, now), now), ["weekly_expenses_missing"])
})

test("inactive policies do not contribute currency or weekly quality reasons", () => {
  assert.deepEqual(reasons({ ...fixed, safetyBufferMode: "percentage_monthly_commitments" }, cash, now), [])
  assert.deepEqual(reasons({ ...fixed, safetyBufferCurrency: "aud" }, { ...cash, currency: null }, now), [])
})

test("partial policy schema preserves legacy omission and allows only explicit eight-currency tags or null", () => {
  assert.deepEqual(CommitGuardSettingsSchema.parse({ safetyBufferFixedCents: 50000 }), { safetyBufferFixedCents: 50000 })
  assert.deepEqual(CommitGuardSettingsSchema.parse({}), {})
  for (const currency of [...COMMIT_GUARD_CURRENCIES, null]) {
    assert.equal(CommitGuardSettingsSchema.parse({ safetyBufferCurrency: currency }).safetyBufferCurrency, currency)
  }
  for (const input of [
    { safetyBufferCurrency: "jpy" }, { safetyBufferCurrency: "AUD" }, { safetyBufferCurrency: "" },
    { safetyBufferFixedCents: 2_147_483_648 }, { safetyBufferFixedCents: -1 }, { safetyBufferFixedCents: 1.5 },
    { userId: "foreign" }, { calculationRevision: 9 }, { weeklyExpensesAsOf: "2026-10-19" },
  ]) assert.equal(CommitGuardSettingsSchema.safeParse(input).success, false)
})