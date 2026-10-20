import assert from "node:assert/strict"
import { beforeEach, describe, mock, test } from "node:test"
import type { PrismaTx } from "@/lib/db/withUserContext"

const now = new Date("2026-10-19T01:00:00Z")
const userId = "tenant-owner"
const base = {
  currency: "aud", timezone: "Australia/Sydney", horizonWeeks: 13,
  bufferTargetCents: 200_000, updatedAt: now, createdAt: now,
}
const ownedPlan = { ...base, id: "owned-a", userId, name: "Owner plan" }
type Plan = typeof ownedPlan
type Setting = typeof base & { id: string; userId: string; planId: string | null }
let plans: Plan[] = []
let settings: Setting[] = []
let balance: Record<string, unknown> | null = null
const calls: Array<{ table: string; query: Record<string, unknown> }> = []
let contexts: string[] = []

interface Query {
  where: Record<string, unknown>
  orderBy: Array<Record<string, "desc">>
  select: Record<string, boolean>
}
function find(table: string, rows: Array<Plan | Setting>, query: Query) {
  calls.push({ table, query: query as unknown as Record<string, unknown> })
  assert.equal(query.where.userId, userId)
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }])
  const filtered = rows.filter((row) => Object.entries(query.where).every(([key, value]) =>
    (row as unknown as Record<string, unknown>)[key] === value))
  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
  const row = filtered[0]
  return row ? Object.fromEntries(Object.keys(query.select).map((key) =>
    [key, (row as unknown as Record<string, unknown>)[key]])) : null
}
// Only read delegates exist. Any attempted snapshot/fact/default read or write fails.
const tx = new Proxy({
  cashPlan: { findFirst: async (query: Query) => find("plan", plans, query) },
  cashPlanSetting: { findFirst: async (query: Query) => find("settings", settings, query) },
  commitGuardCashContext: { findUnique: async (query: { where: { userId: string } }) => {
    assert.deepEqual(query.where, { userId })
    calls.push({ table: "cash", query })
    return balance
  } },
}, { get(target, key, receiver) {
  assert.ok(key in target, `Unexpected persistence access: ${String(key)}`)
  return Reflect.get(target, key, receiver)
} })

mock.module("@/lib/db/withUserContext", { namedExports: {
  withUserContext: async (identity: string, callback: (value: PrismaTx) => Promise<unknown>) => {
    contexts.push(identity)
    return callback(tx as unknown as PrismaTx)
  },
} })
// Exercise the actual loader, actual in-transaction cash loader and pure assembler.
const { loadCashPlanInputs, loadCashPlanInputsInTransaction, CashPlanNotFoundError } =
  await import("@/lib/cashplan/inputLoader")

beforeEach(() => {
  plans = [{ ...ownedPlan }]
  settings = []
  balance = {
    amountCents: 500_000, currency: "aud", balanceAsOf: new Date("2026-10-19T00:00:00Z"),
    weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null,
    taxProtectionCurrency: null, revision: 12,
  }
  calls.length = 0
  contexts = []
})
function load(planId?: string) { return loadCashPlanInputs(userId, { planId, now }) }
function setting(id: string, planId: string | null, overrides: Partial<Setting> = {}): Setting {
  return { ...base, id, userId, planId, ...overrides }
}

describe("CashPlan 8.1 actual tenant input loader", () => {
  test("valid requested owned plan wins over newer defaults and foreign plans", async () => {
    plans.push({ ...ownedPlan, id: "newer", createdAt: new Date("2026-10-20Z") },
      { ...ownedPlan, id: "foreign", userId: "other", createdAt: new Date("2026-10-21Z") })
    const result = await load(ownedPlan.id)
    assert.equal(result.plan?.id, ownedPlan.id)
    assert.deepEqual(contexts, [userId])
    assert.deepEqual(calls[0].query.where, { userId, id: ownedPlan.id })
    assert.equal(result.startingBalance.amountCents, 500_000)
    assert.equal(JSON.stringify(result).includes(userId), false)
    assert.equal(result.startingBalance.cashInputRevision, 12)
  })
  for (const id of ["missing", "foreign"]) {
    test(`${id} requested plan returns safe 404 with no fallback or cash reads`, async () => {
      plans.push({ ...ownedPlan, id: "foreign", userId: "other" })
      await assert.rejects(load(id), (error: unknown) => {
        assert.ok(error instanceof CashPlanNotFoundError)
        assert.equal(error.status, 404)
        assert.equal(error.message, "Not found")
        return true
      })
      assert.deepEqual(calls.map((call) => call.table), ["plan"])
    })
  }
  test("default uses latest tenant plan with stable createdAt/id ties", async () => {
    plans.push({ ...ownedPlan, id: "owned-z" },
      { ...ownedPlan, id: "older-z", createdAt: new Date("2026-10-18Z") },
      { ...ownedPlan, id: "foreign-z", userId: "other", createdAt: new Date("2026-10-20Z") })
    const result = await load()
    assert.equal(result.plan?.id, "owned-z")
    assert.deepEqual(calls[0].query.where, { userId })
  })
  test("no existing plan stays unavailable and creates nothing", async () => {
    plans = [{ ...ownedPlan, userId: "other" }]
    settings = [setting("global", null)]
    const result = await load()
    assert.equal(result.plan, null)
    assert.equal(result.startingBalance.amountCents, null)
    assert.deepEqual(result.quality.reasons, ["missing_plan"])
    assert.deepEqual(calls.map((call) => call.table), ["plan", "cash"])
  })
  test("selected plan settings beat newer global and unrelated settings", async () => {
    settings = [setting("selected", ownedPlan.id, { timezone: "America/New_York", bufferTargetCents: 0 }),
      setting("global", null, { currency: "usd", createdAt: new Date("2026-10-20Z") }),
      setting("other", "other-plan", { currency: "eur", createdAt: new Date("2026-10-21Z") })]
    const result = await load()
    assert.equal(result.settings?.id, "selected")
    assert.equal(result.settingsSource, "plan_settings")
    assert.equal(result.configuration?.bufferTargetCents, 0)
    assert.equal(result.configuration?.timezone, "America/New_York")
    assert.equal(result.anchor?.date, "2026-10-18")
    assert.equal(result.anchor?.startsAt, "2026-10-18T04:00:00.000Z")
    assert.equal(calls.filter((call) => call.table === "settings").length, 1)
  })
  test("tenant-global settings are fallback, with deterministic ties and no other-plan leakage", async () => {
    settings = [setting("global-a", null), setting("global-z", null, { bufferTargetCents: 345 }),
      setting("other-plan", "other", { createdAt: new Date("2026-10-21Z") }),
      setting("foreign-global", null, { userId: "other", createdAt: new Date("2026-10-22Z") })]
    const result = await load()
    assert.equal(result.settings?.id, "global-z")
    assert.equal(result.settingsSource, "global_settings")
    assert.equal(result.configuration?.bufferTargetCents, 345)
    assert.deepEqual(calls.filter((call) => call.table === "settings").map((call) => call.query.where),
      [{ userId, planId: ownedPlan.id }, { userId, planId: null }])
  })
  test("without matching settings uses the plan's own currency/timezone/buffer", async () => {
    plans[0] = { ...ownedPlan, currency: "usd", timezone: "America/New_York", bufferTargetCents: 777 }
    settings = [setting("unrelated", "other-plan")]
    const result = await load()
    assert.equal(result.settings, null)
    assert.equal(result.settingsSource, "plan")
    assert.deepEqual(result.configuration, {
      currency: "usd", timezone: "America/New_York", horizonWeeks: 13, bufferTargetCents: 777,
    })
    assert.equal(result.startingBalance.amountCents, null)
    assert.deepEqual(result.quality.reasons, ["cash_currency_mismatch"])
  })
  test("selected settings currency is enforced against actual cash loader data", async () => {
    settings = [setting("selected", ownedPlan.id, { currency: "usd" })]
    const result = await load()
    assert.equal(result.cashContext.currency, "aud")
    assert.equal(result.configuration?.currency, "usd")
    assert.equal(result.startingBalance.amountCents, null)
    assert.deepEqual(result.quality.reasons, ["cash_currency_mismatch"])
  })
  for (const days of [7, 8]) {
    test(`actual cash loader retains day-${days} source date and nullable usability`, async () => {
      balance!.balanceAsOf = new Date(`2026-10-${19 - days}T00:00:00Z`)
      const result = await load()
      assert.equal(result.startingBalance.amountCents, days === 7 ? 500_000 : null)
      assert.equal(result.cashContext.amountCents, 500_000)
      assert.equal(result.quality.state, days === 7 ? "preliminary" : "unavailable")
      assert.deepEqual(result.quality.reasons, [days === 7 ? "unreconciled_balance_age" : "stale_balance"])
    })
  }
  for (const amountCents of [0, -123]) {
    test(`actual cash loader preserves signed gross cash ${amountCents}`, async () => {
      balance!.amountCents = amountCents
      assert.equal((await load()).startingBalance.amountCents, amountCents)
    })
  }
  test("missing owner cash is unavailable rather than a snapshot/zero fallback", async () => {
    balance = null
    const result = await load()
    assert.equal(result.startingBalance.amountCents, null)
    assert.deepEqual(result.quality.reasons, ["missing_balance"])
  })
  test("selected unsupported horizon and invalid timezone stay unavailable", async () => {
    settings = [setting("selected", ownedPlan.id, { horizonWeeks: 26, timezone: "Invalid/Zone" })]
    const result = await load()
    assert.equal(result.anchor, null)
    assert.equal(result.configuration?.horizonWeeks, 26)
    assert.equal(result.startingBalance.amountCents, null)
    assert.deepEqual(result.quality.reasons, ["unsupported_horizon", "unsupported_timezone"])
  })
  test("transaction variant composes with caller's tenant snapshot without a nested transaction", async () => {
    const result = await loadCashPlanInputsInTransaction(tx as unknown as PrismaTx, userId, { now })
    assert.equal(result.plan?.id, ownedPlan.id)
    assert.deepEqual(contexts, [])
    assert.deepEqual(calls.map((call) => call.table), ["plan", "settings", "settings", "cash"])
  })
  test("real loader preserves a DST anchor and all fourteen independent week boundaries", async () => {
    const clock = new Date("2026-10-03T14:30:00Z")
    balance!.balanceAsOf = new Date("2026-10-03T00:00:00Z")
    const result = await loadCashPlanInputs(userId, { now: clock })
    assert.equal(result.anchor?.date, "2026-10-04")
    assert.equal(result.anchor?.startsAt, "2026-10-03T14:00:00.000Z")
    assert.equal(result.anchor?.weekStartsAt[1], "2026-10-10T13:00:00.000Z")
    assert.equal(result.anchor?.weekStartsAt.length, 14)
    assert.equal(result.startingBalance.evaluationDate, "2026-10-04")
    assert.deepEqual(result.quality.reasons, ["unreconciled_balance_age"])
  })
  test("repeated loading is read-only and neither reads nor mutates historical snapshots", async () => {
    const first = await load()
    const second = await load()
    assert.deepEqual(first, second)
    // The persistence proxy rejects snapshot delegates and any other table access.
    assert.ok(calls.every((call) => ["plan", "settings", "cash"].includes(call.table)))
  })
})