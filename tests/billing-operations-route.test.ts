import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { Prisma } from "@/lib/generated/prisma/client"

const tenant = "11111111-1111-4111-8111-111111111111"
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const url = `https://paidsoon.test/api/billing/operations/${operationId}`

describe("own billing operation routes (offline auth/RLS/journal mocks)", () => {
  let get: typeof import("@/app/api/billing/operations/[operationId]/route").GET
  let post: typeof import("@/app/api/billing/operations/[operationId]/reconcile/route").POST
  let Conflict: typeof import("@/lib/billing/tenantBillingFence").TenantBillingConflictError
  let user: { id: string } | null, authError: unknown, profile: { userId: string } | null
  let contexts: string[], calls: unknown[], failure: unknown, body: unknown, httpStatus: number
  let dbFailure: boolean
  before(async () => {
    await mock.module("server-only", { namedExports: {} })
    ;({ TenantBillingConflictError: Conflict } = await import("@/lib/billing/tenantBillingFence"))
    await mock.module("@/lib/supabase/server", { namedExports: {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: authError }) } }),
    } })
    await mock.module("@/lib/db/withUserContext", { namedExports: {
      withUserContext: async (id: string, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        contexts.push(id)
        if (dbFailure) throw new Error("private database connection data")
        return run({ userProfile: { findUnique: async (args: unknown) => {
          assert.deepEqual(args, { where: { userId: tenant }, select: { userId: true } })
          return profile
        } } } as unknown as Prisma.TransactionClient)
      },
    } })
    await mock.module("@/lib/billing/customerBillingOperations", { namedExports: { customerBillingOperations: {
      status: async (...args: unknown[]) => { calls.push(["status", ...args]); if (failure) throw failure; return body },
      reconcile: async (...args: unknown[]) => { calls.push(["reconcile", ...args]); if (failure) throw failure; return { httpStatus, body } },
    } } })
    ;({ GET: get } = await import("@/app/api/billing/operations/[operationId]/route"))
    ;({ POST: post } = await import("@/app/api/billing/operations/[operationId]/reconcile/route"))
  })
  beforeEach(() => {
    user = { id: tenant }; authError = null; profile = { userId: tenant }; failure = undefined
    contexts = []; calls = []; httpStatus = 202; dbFailure = false
    body = { operationId, action: "portal_create", status: "reconciliation_required", result: null,
      failureCode: null, reconciliationRequired: true, canReconcile: false,
      createdAt: "2026-10-15T12:00:00.000Z", completedAt: null, statusUrl: `/api/billing/operations/${operationId}` }
  })
  const context = (id = operationId) => ({ params: Promise.resolve({ operationId: id }) })
  const request = (value = "{}", origin: string | null = "https://paidsoon.test", extra: Record<string, string> = {}) =>
    new Request(`${url}/reconcile`, { method: "POST", body: value,
      headers: { ...(origin === null ? {} : { origin }), "content-type": "application/json", ...extra } })

  test("GET authenticates then RLS-checks the own profile before narrowly scoped journal access; no provider or mutation", async () => {
    const result = await get(new Request(url), context())
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), body)
    assert.deepEqual(contexts, [tenant]); assert.deepEqual(calls, [["status", tenant, operationId]])
    assert.equal(result.headers.get("cache-control"), "private, no-store")
  })
  test("same-origin empty-object POST returns accepted safe 202 without arbitrary intent or headers", async () => {
    const result = await post(request(), context())
    assert.equal(result.status, 202); assert.deepEqual(await result.json(), body)
    assert.deepEqual(calls, [["reconcile", tenant, operationId]])
    assert.equal(result.headers.get("cache-control"), "private, no-store")
  })
  test("absent/rejected authentication returns 401 before body validation, RLS or journal", async () => {
    for (const state of ["missing", "error"]) {
      if (state === "missing") user = null
      else { user = { id: tenant }; authError = new Error("invalid session") }
      for (const result of [await get(new Request(url), context()), await post(request("{", "https://evil.test"), context())]) {
        assert.equal(result.status, 401); assert.deepEqual(await result.json(), { error: "Unauthorized" })
      }
    }
    assert.deepEqual(contexts, []); assert.deepEqual(calls, [])
  })
  test("cross-origin, missing/null Origin, subdomain and cross-site fetch metadata fail before RLS/journal", async () => {
    for (const origin of [null, "null", "https://evil.test", "https://sub.paidsoon.test", "http://paidsoon.test", "https://paidsoon.test/"]) {
      assert.equal((await post(request("{}", origin), context())).status, 403)
    }
    assert.equal((await post(request("{}", "https://paidsoon.test", { "sec-fetch-site": "cross-site" }), context())).status, 403)
    assert.deepEqual(contexts, []); assert.deepEqual(calls, [])
  })
  for (const value of ["", "{", "null", "[]", "1", '"{}"', '{"userId":"foreign"}', '{"operationId":"other"}',
    '{"stripeCustomerId":"cus_foreign"}', '{"params":{}}', '{"idempotencyKey":"new"}', '{"expectedVersion":1}']) {
    test(`strict empty body rejects ${value || "missing body"} before journal/provider`, async () => {
      assert.equal((await post(request(value), context())).status, 400)
      assert.deepEqual(contexts, []); assert.deepEqual(calls, [])
    })
  }
  test("malformed UUID, missing profile, missing/foreign/owner operation all return identical scoped404", async () => {
    const results: Response[] = [await get(new Request(url), context("not-uuid")), await post(request(), context("not-uuid"))]
    profile = null
    results.push(await get(new Request(url), context()), await post(request(), context()))
    profile = { userId: tenant }
    failure = new Conflict("billing_operation_not_found")
    // Service scopes customer tenant AND actor and never consults the owner journal.
    for (const _scenario of ["missing", "foreign", "admin"]) {
      results.push(await get(new Request(url), context()), await post(request(), context()))
    }
    for (const result of results) {
      assert.equal(result.status, 404); assert.deepEqual(await result.json(), { error: "Not found" })
    }
  })
  test("UUID is normalized and cannot be used to supply another tenant scope", async () => {
    await get(new Request(url), context(operationId.toUpperCase()))
    assert.deepEqual(calls, [["status", tenant, operationId]])
  })
  test("live execution is a safe409; initial persistence or unreadable status is503 without sensitive details", async () => {
    failure = new Conflict("billing_execution_in_progress")
    let result = await post(request(), context())
    assert.equal(result.status, 409); assert.deepEqual(await result.json(), { error: "billing_execution_in_progress" })
    failure = new Error("email=private@example.test stripe_key=secret rawParams=private")
    result = await post(request(), context())
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: "billing_operation_unavailable" })
    failure = undefined; dbFailure = true
    result = await get(new Request(url), context())
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: "billing_operation_unavailable" })
  })
  test("terminal reconciliation keeps original success shapes and safe definitive502", async () => {
    for (const original of [{ url: "https://billing.stripe.test/session" }, { redirectUrl: "https://paidsoon.test/settings" },
      { scheduledAt: "2026-11-01T00:00:00.000Z" }, { cancelled: true }]) {
      body = original; httpStatus = 200
      const result = await post(request(), context())
      assert.equal(result.status, 200); assert.deepEqual(await result.json(), original)
    }
    body = { error: "billing_provider_rejected" }; httpStatus = 502
    const result = await post(request(), context())
    assert.equal(result.status, 502); assert.deepEqual(await result.json(), body)
  })
})