import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { assembleCashPlanInputs, type CashPlanSelectedPlan } from "@/lib/cashplan/assembler"
import { buildCashPlanAnchor, getCashPlanWeekIndex } from "@/lib/cashplan/calendar"
import { toCommitGuardCashContextDto } from "@/lib/commitguard/cashContext"

const now = new Date("2026-10-19T01:00:00Z")
const plan: CashPlanSelectedPlan = {
  id: "plan-a", name: "Owner plan", currency: "aud", timezone: "Australia/Sydney",
  horizonWeeks: 13, bufferTargetCents: 400_000, updatedAt: now,
}
function cash(amountCents: number | null = 500_000, date = "2026-10-19", clock = now) {
  return toCommitGuardCashContextDto(amountCents === null ? null : {
    amountCents, currency: "aud", balanceAsOf: new Date(`${date}T00:00:00Z`),
    weeklyOperatingExpensesCents: 100_000, weeklyExpensesCurrency: "aud",
    weeklyExpensesAsOf: new Date(`${date}T00:00:00Z`), taxProtectionCurrency: "aud", revision: 9,
  }, clock)
}
function assemble(options: Partial<Parameters<typeof assembleCashPlanInputs>[0]> = {}) {
  return assembleCashPlanInputs({ plan, settings: null, cashContext: cash(), now, ...options })
}

describe("CashPlan 8.1 pure assembly inputs", () => {
  test("uses dated owner gross cash without subtracting buffer, tax or weekly expenses", () => {
    const result = assemble()
    assert.equal(result.startingBalance.amountCents, 500_000)
    assert.equal(result.configuration?.bufferTargetCents, 400_000)
    assert.equal(result.startingBalance.cashInputRevision, 9)
    assert.equal(result.startingBalance.balanceAsOf, "2026-10-19")
    assert.equal(result.startingBalance.evaluationDate, "2026-10-19")
    assert.equal(result.startingBalance.source, "owner_entered")
    assert.equal(result.startingBalance.estimate, true)
    assert.deepEqual(result.quality, { state: "available", reasons: [] })
  })
  for (const amountCents of [0, -1, -2_147_483_648]) {
    test(`preserves explicitly attested gross cash ${amountCents} as known money`, () => {
      const result = assemble({ cashContext: cash(amountCents) })
      assert.equal(result.startingBalance.amountCents, amountCents)
      assert.equal(result.quality.state, "available")
    })
  }
  for (const age of [0, 1, 7, 8]) {
    test(`UTC balance age ${age} days has the exact usable/preliminary boundary`, () => {
      const date = new Date(now.getTime() - age * 86_400_000).toISOString().slice(0, 10)
      const result = assemble({ cashContext: cash(500_000, date) })
      assert.equal(result.cashContext.freshness, age <= 7 ? "fresh" : "stale")
      assert.equal(result.startingBalance.amountCents, age <= 7 ? 500_000 : null)
      assert.deepEqual(result.quality, age === 0 ? { state: "available", reasons: [] }
        : age <= 7 ? { state: "preliminary", reasons: ["unreconciled_balance_age"] }
          : { state: "unavailable", reasons: ["stale_balance"] })
      assert.equal(result.startingBalance.balanceAsOf, date)
      assert.equal(result.startingBalance.evaluationDate, "2026-10-19")
    })
  }
  test("missing cash remains null and never produces a zero-based forecast", () => {
    const result = assemble({ cashContext: cash(null) })
    assert.equal(result.startingBalance.amountCents, null)
    assert.deepEqual(result.quality, { state: "unavailable", reasons: ["missing_balance"] })
    assert.equal("forecast" in result, false)
    assert.equal("freeCash" in result, false)
  })
  test("mismatch retains source cash currency without relabeling or summing it", () => {
    const result = assemble({ plan: { ...plan, currency: "usd" } })
    assert.equal(result.startingBalance.amountCents, null)
    assert.equal(result.startingBalance.currency, "usd")
    assert.equal(result.cashContext.currency, "aud")
    assert.deepEqual(result.quality.reasons, ["cash_currency_mismatch"])
  })
  test("selected settings determine currency, timezone, horizon and buffer rather than the plan", () => {
    const result = assemble({ settings: {
      id: "setting-a", planId: plan.id, currency: "USD", timezone: "America/New_York",
      horizonWeeks: 13, bufferTargetCents: 0, updatedAt: now,
    } })
    assert.deepEqual(result.configuration, {
      currency: "usd", timezone: "America/New_York", horizonWeeks: 13, bufferTargetCents: 0,
    })
    assert.equal(result.anchor?.date, "2026-10-18")
    assert.equal(result.startingBalance.amountCents, null)
    assert.equal(result.settingsSource, "plan_settings")
  })
  test("ignores settings for an unrelated plan at the pure boundary", () => {
    const result = assemble({ settings: { ...plan, id: "setting-b", planId: "other", currency: "usd" } })
    assert.equal(result.configuration?.currency, "aud")
    assert.equal(result.settings, null)
    assert.equal(result.settingsSource, "plan")
  })
  test("no existing plan is unavailable even with cash and global settings", () => {
    const result = assemble({ plan: null, settings: { ...plan, id: "global", planId: null } })
    assert.equal(result.startingBalance.amountCents, null)
    assert.equal(result.configuration, null)
    assert.equal(result.anchor, null)
    assert.equal(result.settingsSource, null)
    assert.deepEqual(result.quality.reasons, ["missing_plan"])
  })
  for (const horizonWeeks of [1, 12, 14, 52]) {
    test(`stored ${horizonWeeks}-week horizon is explicitly unsupported, not silently truncated`, () => {
      const result = assemble({ plan: { ...plan, horizonWeeks } })
      assert.equal(result.configuration?.horizonWeeks, horizonWeeks)
      assert.equal(result.startingBalance.amountCents, null)
      assert.deepEqual(result.quality.reasons, ["unsupported_horizon"])
    })
  }
  for (const timezone of ["Not/A_Zone", "", "+10:00"]) {
    test(`invalid timezone ${JSON.stringify(timezone)} fails closed without UTC guessing`, () => {
      const result = assemble({ plan: { ...plan, timezone } })
      assert.equal(result.anchor, null)
      assert.equal(result.startingBalance.amountCents, null)
      assert.deepEqual(result.quality.reasons, ["unsupported_timezone"])
    })
  }
  test("unsupported currency and stale cash retain multiple reasons with unavailable money", () => {
    const result = assemble({ plan: { ...plan, currency: "jpy" }, cashContext: cash(7, "2026-10-11") })
    assert.deepEqual(result.quality.reasons, ["unsupported_currency", "stale_balance", "cash_currency_mismatch"])
    assert.equal(result.startingBalance.amountCents, null)
  })
  test("balance age labels compare both dates against business anchor, freshness stays UTC", () => {
    const clock = new Date("2026-10-19T23:30:00Z")
    const result = assemble({ now: clock, cashContext: cash(500_000, "2026-10-19", clock) })
    assert.equal(result.cashContext.freshness, "fresh")
    assert.equal(result.anchor?.date, "2026-10-20")
    assert.equal(result.startingBalance.evaluationDate, "2026-10-20")
    assert.equal(result.startingBalance.balanceAsOf, "2026-10-19")
    assert.deepEqual(result.quality, { state: "preliminary", reasons: ["unreconciled_balance_age"] })
  })
})

describe("CashPlan business-calendar anchor and obligation indexing", () => {
  for (const [timezone, clock, date, start] of [
    ["Australia/Sydney", "2026-10-03T14:30:00Z", "2026-10-04", "2026-10-03T14:00:00.000Z"],
    ["America/New_York", "2026-03-08T03:00:00Z", "2026-03-07", "2026-03-07T05:00:00.000Z"],
    ["Asia/Kathmandu", "2026-10-18T19:00:00Z", "2026-10-19", "2026-10-18T18:15:00.000Z"],
  ]) {
    test(`${timezone} anchors at local midnight on the actual evaluation date`, () => {
      const anchor = buildCashPlanAnchor(new Date(clock), timezone)
      assert.equal(anchor.date, date)
      assert.equal(anchor.startsAt, start)
      assert.equal(anchor.weekStartsAt.length, 14)
      assert.equal(anchor.endsAt, anchor.weekStartsAt[13])
    })
  }
  for (const [timezone, clock, nextStart, hours] of [
    ["Australia/Sydney", "2026-10-03T14:30:00Z", "2026-10-10T13:00:00.000Z", 167],
    ["Australia/Sydney", "2026-04-04T13:30:00Z", "2026-04-11T14:00:00.000Z", 169],
    ["America/New_York", "2026-03-08T05:30:00Z", "2026-03-15T04:00:00.000Z", 167],
    ["America/New_York", "2026-11-01T04:30:00Z", "2026-11-08T05:00:00.000Z", 169],
  ] as const) {
    test(`${timezone} ${hours}-hour DST week still contains exactly seven local dates`, () => {
      const anchor = buildCashPlanAnchor(new Date(clock), timezone)
      assert.equal(anchor.weekStartsAt[1], nextStart)
      assert.equal((Date.parse(nextStart) - Date.parse(anchor.startsAt)) / 3_600_000, hours)
      const firstUtcDate = new Date(`${anchor.date}T00:00:00Z`)
      // At UTC midnight NY is on the previous date; Sydney is on the same date.
      const shift = timezone === "America/New_York" ? 1 : 0
      for (const offset of [-1, 0, 6, 7, 90, 91]) {
        const obligation = new Date(firstUtcDate.getTime() + (offset + shift) * 86_400_000).toISOString().slice(0, 10)
        assert.equal(getCashPlanWeekIndex(obligation, anchor), offset < 0 || offset >= 91 ? null : Math.floor(offset / 7))
      }
    })
  }
  test("UTC dates are converted to the business date before indexing in a westward timezone", () => {
    const anchor = buildCashPlanAnchor(new Date("2026-10-19T16:00:00Z"), "America/New_York")
    assert.equal(getCashPlanWeekIndex("2026-10-19", anchor), null)
    assert.equal(getCashPlanWeekIndex("2026-10-20", anchor), 0)
    assert.equal(getCashPlanWeekIndex("2026-10-26", anchor), 0)
    assert.equal(getCashPlanWeekIndex("2026-10-27", anchor), 1)
  })
  test("invalid obligation calendar dates are rejected rather than rolled over", () => {
    const anchor = buildCashPlanAnchor(now, "UTC")
    for (const value of ["2026-02-30", "2026-10-19T00:00:00Z", "not-a-date"]) {
      assert.throws(() => getCashPlanWeekIndex(value, anchor))
    }
  })
  test("a timezone date with nonexistent midnight is explicitly unsupported", () => {
    assert.throws(() => buildCashPlanAnchor(new Date("2026-09-06T05:00:00Z"), "America/Santiago"), RangeError)
    const clock = new Date("2026-09-06T05:00:00Z")
    const result = assemble({ now: clock, plan: { ...plan, timezone: "America/Santiago" },
      cashContext: cash(500_000, "2026-09-06", clock) })
    assert.equal(result.anchor, null)
    assert.equal(result.startingBalance.amountCents, null)
    assert.deepEqual(result.quality, { state: "unavailable", reasons: ["unsupported_timezone"] })
  })
})