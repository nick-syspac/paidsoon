import assert from "node:assert/strict"
import { beforeEach, describe, mock, test } from "node:test"
import type { PrismaTx } from "@/lib/db/withUserContext"

const now = new Date("2026-10-19T01:00:00Z")
let user: { id: string } | null = { id: "owner" }
let allowed = true
let planExists = true
let timezone = "Australia/Sydney"
let horizonWeeks = 13
const writes: Array<Record<string, unknown>> = []
const reads: Array<{ table: string; query: Record<string, unknown> }> = []
const tx = {
  cashPlan: { findFirst: async (query: Record<string, unknown>) => {
    reads.push({ table: "plan", query })
    assert.equal((query.where as Record<string, unknown>).userId, "owner")
    return planExists ? { id: "plan-a", name: "Plan", currency: "aud", timezone, horizonWeeks,
      bufferTargetCents: 0, updatedAt: now } : null
  } },
  cashPlanSetting: { findFirst: async (query: Record<string, unknown>) => {
    reads.push({ table: "settings", query }); return null
  } },
  commitGuardCashContext: { findUnique: async () => null },
  cashPlanOverride: { create: async ({ data }: { data: Record<string, unknown> }) => {
    writes.push(data); return { id: `stored-${writes.length}` }
  } },
}
mock.module("@/lib/db/withUserContext", { namedExports: {
  withUserContext: async (userId: string, callback: (tx: PrismaTx) => Promise<unknown>) => {
    assert.equal(userId, "owner"); return callback(tx as unknown as PrismaTx)
  },
} })
mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({
  auth: { getUser: async () => ({ data: { user } }) },
}) } })
mock.module("@/lib/billing/subscriptionRoute", { namedExports: {
  withSubscriptionAccess: (handler: (request: Request) => Promise<Response>) => async (request: Request) =>
    allowed ? handler(request) : Response.json({ error: "Upgrade required" }, { status: 403 }),
} })
const { POST } = await import("@/app/api/cashplan/items/route")
const body = (patch: Record<string, unknown> = {}) => ({ planId: "plan-a", kind: "outflow",
  amountCents: 12_000, plannedDate: "2026-11-03", reason: "Known bill", ...patch })
const post = (value: unknown) => POST(new Request("https://paidsoon.test/api/cashplan/items", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
}))

beforeEach(() => {
  mock.timers.reset()
  mock.timers.enable({ apis: ["Date"], now })
  user = { id: "owner" }; allowed = true; planExists = true; timezone = "Australia/Sydney"; horizonWeeks = 13
  writes.length = 0; reads.length = 0
})

describe("CashPlan 8.3 actual planned-item POST route", () => {
  test("persists exact UTC planned date and computes week from selected timezone, not supplied week or source ID", async () => {
    const response = await post(body({ weekIndex: 12, sourceId: "opaque-week-9", userId: "foreign" }))
    assert.equal(response.status, 200)
    assert.equal(writes.length, 1)
    assert.equal((writes[0].plannedDate as Date).toISOString(), "2026-11-03T00:00:00.000Z")
    assert.equal(writes[0].createdBy, "owner")
    assert.equal(writes[0].planId, "plan-a")
    const result = await response.json()
    assert.equal(result.plannedItem.weekIndex, 2)
    assert.equal(result.plannedItem.plannedDate, "2026-11-03T00:00:00.000Z")
    assert.equal(result.override.plannedDate, "2026-11-03")
    assert.deepEqual(reads[0].query.orderBy, [{ createdAt: "desc" }, { id: "desc" }])
  })
  for (const plannedDate of [undefined, null, "", "2026-02-30", "2026-13-01", "not-a-date",
    "2026-11-03T00:00:00Z", "2026-11-03T10:00:00+11:00"]) test(`invalid/missing planned date ${String(plannedDate)} is rejected before DB`, async () => {
    assert.equal((await post(body({ plannedDate }))).status, 400)
    assert.equal(reads.length, 0)
    assert.equal(writes.length, 0)
  })
  for (const plannedDate of ["2026-10-18", "2027-01-18", "2030-01-01"]) test(`out-of-window date ${plannedDate} never persists`, async () => {
    assert.equal((await post(body({ plannedDate }))).status, 400)
    assert.equal(writes.length, 0)
  })
  for (const plannedDate of ["2026-10-19", "2027-01-17"]) test(`half-open window includes ${plannedDate}`, async () => {
    assert.equal((await post(body({ plannedDate }))).status, 200)
    assert.equal(writes.length, 1)
  })
  test("DST-aware selected timezone determines the actual week", async () => {
    timezone = "America/New_York"
    const result = await (await post(body({ plannedDate: "2026-11-02" }))).json()
    // Evaluation is Oct 18 locally; UTC Nov 2 is local Nov 1 (day 14).
    assert.equal(result.plannedItem.weekIndex, 2)
  })
  test("distinct same-week new manual items have distinct persisted identities", async () => {
    await post(body()); await post(body())
    assert.equal(writes.length, 2)
    assert.notEqual(writes[0].entityId, writes[1].entityId)
    assert.equal(writes[0].sourceId, writes[0].entityId)
  })
  for (const patch of [{ amountCents: 0 }, { amountCents: 2_147_483_648 }, { amountCents: 1.1 },
    { sourceType: "generated" }, { sourceId: "commitguard:foreign:2026-11-03" },
    { effectiveFrom: "2026-11-04T00:00:00Z", expiresAt: "2026-11-03T00:00:00Z" }]) test(`invalid manual payload ${JSON.stringify(patch)}`, async () => {
    assert.equal((await post(body(patch))).status, 400)
    assert.equal(writes.length, 0)
  })
  test("unauthenticated request has no reads or writes", async () => {
    user = null
    assert.equal((await post(body())).status, 401)
    assert.equal(reads.length, 0); assert.equal(writes.length, 0)
  })
  test("subscription denial has no reads or writes", async () => {
    allowed = false
    assert.equal((await post(body())).status, 403)
    assert.equal(reads.length, 0); assert.equal(writes.length, 0)
  })
  test("requested foreign/missing plan cannot fall through to another plan", async () => {
    planExists = false
    assert.equal((await post(body({ planId: "foreign" }))).status, 404)
    assert.deepEqual(reads[0].query.where, { userId: "owner", id: "foreign" })
    assert.equal(writes.length, 0)
  })
  test("unsupported stored horizon never accepts a manual date", async () => {
    horizonWeeks = 26
    assert.equal((await post(body())).status, 400)
    assert.equal(writes.length, 0)
  })
  test("malformed JSON receives 400", async () => {
    const response = await POST(new Request("https://paidsoon.test/api/cashplan/items", { method: "POST", body: "{" }))
    assert.equal(response.status, 400)
    assert.equal(writes.length, 0)
  })
})