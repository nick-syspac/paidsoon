import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { Prisma, UserProfile } from "@/lib/generated/prisma/client"
import type { customerBillingExecutors } from "@/lib/billing/customerBillingExecutors"

const tenant = "11111111-1111-4111-8111-111111111111"
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
type Start = Parameters<typeof customerBillingExecutors.accept>[0]

describe("customer billing mutation route safety (offline auth/RLS/service mocks)", () => {
  let routes: { path: string; method: string; kind: string; body?: string; handler: (request: Request) => Promise<Response> }[]
  let user: { id: string; email: string } | null, authError: unknown, profile: UserProfile | null
  let calls: Start[], contexts: string[], bootstraps: string[], dbFailure: boolean, bootstrapWorks: boolean
  let failure: unknown, result: { httpStatus: number; body: unknown }
  let Conflict: typeof import("@/lib/billing/tenantBillingFence").TenantBillingConflictError
  const fixture = () => ({ userId: tenant, billingAccessVersion: 7, subscriptionStatus: "canceled" }) as UserProfile
  before(async () => {
    await mock.module("server-only", { namedExports: {} })
    ;({ TenantBillingConflictError: Conflict } = await import("@/lib/billing/tenantBillingFence"))
    await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user }, error: authError }),
    } }) } })
    await mock.module("@/lib/db/withUserContext", { namedExports: {
      withUserContext: async (id: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        contexts.push(id)
        if (dbFailure) throw new Error("private DB error")
        return run({ userProfile: { findUnique: async (args: unknown) => {
          assert.deepEqual(args, { where: { userId: tenant } }); return profile
        }, update: () => assert.fail("customer-role billing writes forbidden"),
        upsert: () => assert.fail("customer-role bootstrap forbidden") } } as unknown as Prisma.TransactionClient)
      },
    } })
    await mock.module("@/lib/actions/auth", { namedExports: { createUserProfile: async (id: string) => {
      bootstraps.push(id); if (bootstrapWorks) profile = fixture()
    } } })
    await mock.module("@/lib/billing/customerBillingOperations", { namedExports: { customerBillingOperations: {
      start: async (input: Start) => { calls.push(input); if (failure) throw failure; return result },
    } } })
    const checkout = await import("@/app/api/billing/checkout/route")
    const portal = await import("@/app/api/billing/portal/route")
    const cancel = await import("@/app/api/billing/cancel/route")
    const downgrade = await import("@/app/api/billing/downgrade/route")
    routes = [
      { path: "checkout", method: "POST", kind: "checkout", handler: checkout.POST },
      { path: "portal", method: "POST", kind: "portal", handler: portal.POST },
      { path: "cancel", method: "POST", kind: "cancel", handler: cancel.POST },
      { path: "downgrade", method: "POST", kind: "downgrade", body: '{"tier":"starter"}', handler: downgrade.POST },
      { path: "downgrade", method: "DELETE", kind: "undo_downgrade", handler: downgrade.DELETE },
    ]
  })
  beforeEach(() => {
    user = { id: tenant, email: "owner@example.test" }; authError = null; profile = fixture()
    calls = []; contexts = []; bootstraps = []; failure = undefined; dbFailure = false; bootstrapWorks = true
    result = { httpStatus: 200, body: { url: "https://billing.stripe.test/session" } }
  })
  const request = (route: typeof routes[number], headers: Record<string, string | null> = {}, body = route.body, query = "") => {
    const values = new Headers({ origin: "https://paidsoon.test", "idempotency-key": operationId,
      "x-billing-access-version": "7" })
    for (const [key, value] of Object.entries(headers)) { if (value === null) values.delete(key); else values.set(key, value) }
    return new Request(`https://paidsoon.test/api/billing/${route.path}${query}`, { method: route.method, headers: values, body })
  }
  test("all five methods authenticate before validation, RLS or privileged service", async () => {
    for (const state of ["absent", "rejected"]) {
      if (state === "absent") user = null
      else { user = { id: tenant, email: "owner@example.test" }; authError = new Error("bad session") }
      for (const route of routes) assert.equal((await route.handler(request(route, { origin: "https://evil.test" }))).status, 401)
    }
    assert.deepEqual(contexts, []); assert.deepEqual(calls, []); assert.deepEqual(bootstraps, [])
  })
  test("all five methods reject missing/null/foreign/subdomain/protocol origins and cross-site metadata", async () => {
    for (const route of routes) {
      for (const origin of [null, "null", "https://evil.test", "https://sub.paidsoon.test", "http://paidsoon.test", "https://paidsoon.test/"]) {
        assert.equal((await route.handler(request(route, { origin }))).status, 403)
      }
      assert.equal((await route.handler(request(route, { "sec-fetch-site": "cross-site" }))).status, 403)
    }
    assert.deepEqual(contexts, []); assert.deepEqual(calls, [])
  })
  test("all methods require strict UUID and nonnegative safe integer headers before ownership/provider work", async () => {
    for (const route of routes) {
      for (const key of [null, "", "not-a-uuid", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", `${operationId},${operationId}`]) {
        assert.equal((await route.handler(request(route, { "idempotency-key": key }))).status, 400)
      }
      for (const version of [null, "", "-1", "1.0", "1e2", "+1", "01", "NaN", "Infinity", "9007199254740992", "1,2"]) {
        assert.equal((await route.handler(request(route, { "x-billing-access-version": version }))).status, 400)
      }
    }
    assert.deepEqual(contexts, []); assert.deepEqual(calls, [])
  })
  test("strict bodies and query contract reject malformed JSON, arrays, scalar, foreign identity and provider patches", async () => {
    for (const route of routes) {
      for (const body of ["{", "null", "[]", "1", '"tier"', '{"userId":"foreign"}', '{"stripeCustomerId":"cus_foreign"}', '{"expectedVersion":7}']) {
        assert.equal((await route.handler(request(route, {}, body))).status, 400)
      }
      assert.equal((await route.handler(request(route, {}, route.body, "?tier=business_pro"))).status, 400)
      assert.equal((await route.handler(request(route, {}, '{"tier":12}'))).status, 400)
    }
    assert.equal((await routes[3].handler(request(routes[3], {}, ""))).status, 400)
    for (const route of [routes[0], routes[3]]) {
      assert.equal((await route.handler(request(route, {}, '{"tier":"accountant_partner"}'))).status, 400)
    }
    assert.deepEqual(contexts, []); assert.deepEqual(calls, [])
  })
  test("optional checkout defaults and legacy/unknown tier normalization remain purchase-only conventions", async () => {
    for (const [body, tier] of [["", "essentials"], ["{}", "essentials"], ['{"tier":"solo"}', "business_control"],
      ['{"tier":"starter"}', "essentials"], ['{"tier":"unknown"}', "essentials"]]) {
      const res = await routes[0].handler(request(routes[0], { "idempotency-key": operationId.toUpperCase(), "x-billing-access-version": "0" }, body))
      assert.equal(res.status, 200)
      assert.deepEqual(calls.at(-1)?.intent, { kind: "checkout", tier })
      assert.equal(calls.at(-1)?.operationId, operationId); assert.equal(calls.at(-1)?.expectedVersion, 0)
    }
  })
  test("RLS ownership precedes narrowly scoped start; routes remain reachable without subscription access", async () => {
    for (const route of routes) {
      const res = await route.handler(request(route))
      assert.equal(res.status, 200); assert.equal(res.headers.get("cache-control"), "private, no-store")
      assert.deepEqual(calls.at(-1), { operationId, expectedVersion: 7, profile, email: user!.email,
        intent: ["checkout", "downgrade"].includes(route.kind) ? { kind: route.kind, tier: "essentials" } : { kind: route.kind } })
    }
    assert.deepEqual(contexts, Array(5).fill(tenant)); assert.deepEqual(bootstraps, [])
  })
  test("only genuinely absent checkout profile uses the existing idempotent auth bootstrap and RLS re-read", async () => {
    profile = null
    assert.equal((await routes[0].handler(request(routes[0]))).status, 200)
    assert.deepEqual(bootstraps, [tenant]); assert.deepEqual(contexts, [tenant, tenant])
    for (const route of routes.slice(1)) { profile = null; assert.equal((await route.handler(request(route))).status, 404) }
    assert.deepEqual(bootstraps, [tenant])
    profile = null; bootstrapWorks = false
    assert.equal((await routes[0].handler(request(routes[0]))).status, 404)
    profile = { ...fixture(), userId: "foreign" }
    assert.equal((await routes[0].handler(request(routes[0]))).status, 404)
    assert.equal(calls.length, 1)
  })
  test("foreign tenant/action/hash, owner/customer reservations and version conflicts have one non-leaking409", async () => {
    for (const code of ["billing_operation_key_conflict", "billing_mutation_in_progress", "billing_operation_in_progress", "billing_version_conflict", "billing_binding_conflict", "billing_already_active"]) {
      failure = new Conflict(code)
      for (const route of routes) {
        const res = await route.handler(request(route)); assert.equal(res.status, 409)
        assert.deepEqual(await res.json(), { error: "billing_conflict" })
      }
    }
  })
  test("initial persistence/provider verification failure is503, definitive502 and unknown202 stay safe", async () => {
    for (const route of routes) {
      for (const error of [new Error("secret provider params owner@example.test"), new Conflict("billing_price_not_configured")]) {
        failure = error
        const res = await route.handler(request(route)); assert.equal(res.status, 503)
        assert.deepEqual(await res.json(), { error: "billing_operation_unavailable" })
      }
      failure = undefined
      for (const httpStatus of [202, 502]) {
        result = { httpStatus, body: httpStatus === 202 ? { operationId, status: "reconciliation_required", statusUrl: `/api/billing/operations/${operationId}` }
          : { error: "billing_provider_rejected" } }
        const res = await route.handler(request(route)); assert.equal(res.status, httpStatus); assert.deepEqual(await res.json(), result.body)
      }
    }
    dbFailure = true
    assert.equal((await routes[0].handler(request(routes[0]))).status, 503)
  })
  test("known results preserve url, redirectUrl, scheduledAt and cancelled response shapes", async () => {
    const shapes = [{ url: "https://checkout.stripe.test/session" }, { url: "https://billing.stripe.test/session" },
      { redirectUrl: "https://paidsoon.test/settings?cancellation=ended" }, { scheduledAt: "2026-11-01T00:00:00.000Z" }, { cancelled: true }]
    for (let i = 0; i < routes.length; i++) {
      result = { httpStatus: 200, body: shapes[i] }
      const res = await routes[i].handler(request(routes[i])); assert.equal(res.status, 200); assert.deepEqual(await res.json(), shapes[i])
    }
  })
})