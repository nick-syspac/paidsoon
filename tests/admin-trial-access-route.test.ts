import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { NextRequest, NextResponse } from "next/server"
import type { AdminGuardContext } from "@/lib/admin/guard"
import type { Prisma } from "@/lib/generated/prisma/client"

type Row = Record<string, unknown>
type Context = { params: Promise<{ id: string; operationId?: string }> }
type Handler = (request: NextRequest, context: Context) => Promise<NextResponse>
const tenant = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
const opId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const actor = "33333333-3333-4333-8333-333333333333"
const future = () => new Date(Date.now() + 3600000)
let handlers: Record<string, Handler>
let profile: Row | null, operation: Row | null, grant: Row | null, notification: Row | null
let role: Row | null, session: Row | null, device: Row | null, authenticated: string | null, cookie: string
let reads: string[], calls: string[], writes: number, providerFail: boolean, persistenceFail: boolean
let outcome: Row, thrown: Error | null, receivedMeta: Row | null, receivedBody: unknown
let previewModule: typeof import("@/lib/billing/trialAccessPreview")
let fenceModule: typeof import("@/lib/billing/tenantBillingFence")
let risks: Row[]

function matches(row: Row | null, where: Row): boolean {
  return row !== null && Object.entries(where).every(([key, value]) => row[key] === value)
}
function selected(row: Row | null, select?: Row): Row | null {
  return !row ? null : structuredClone(select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row)
}
function delegate(label: string, get: () => Row | null) {
  const read = async ({ where, select }: { where: Row; select?: Row }) => {
    reads.push(label)
    if (persistenceFail) throw new Error("private database password customer@example.com")
    return selected(matches(get(), where) ? get() : null, select)
  }
  return { findUnique: read, findFirst: read }
}
const db = {
  platformRole: delegate("role", () => role),
  adminSession: delegate("session", () => session),
  adminDevice: delegate("device", () => device),
  userProfile: delegate("tenant", () => profile),
  tenantTrialGrant: delegate("grant", () => grant),
  tenantTrialNotification: delegate("notification", () => notification),
  tenantBillingMutation: delegate("billing-operation", () => null),
  tenantBillingRisk: { findMany: async () => { reads.push("risks"); return structuredClone(risks) } },
  tenantTrialOperation: { ...delegate("operation", () => operation), create: async ({ data }: { data: Row }) => {
    writes++; operation = { ...structuredClone(data), createdAt: new Date(), updatedAt: new Date() }
    return operation
  } },
  $executeRawUnsafe: async () => { calls.push("lock") },
  $transaction: async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => run(db as unknown as Prisma.TransactionClient),
}

const snapshot = () => ({ allowAccess: true, effectivePlan: "small_business", source: "admin_grant",
  effectiveAccessExpiresAt: "2026-12-01T00:00:00.000Z", effectiveTrialExpiresAt: "2026-12-01T00:00:00.000Z",
  effectiveExpirySource: "admin_grant", effectiveExpiryPlan: "small_business", stripeTrialEndsAt: null,
  billingPlan: "essentials", billingStatus: "trialing", restriction: null, trialTimingPendingReconciliation: false,
  grant: { plan: "small_business", startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-12-01T00:00:00.000Z", revokedAt: null } })
function success(source = "admin_grant"): Row {
  return { operationId: opId, action: "extend_or_grant", source, status: "succeeded", targetPlan: "small_business",
    targetExpiresAt: "2026-12-01T00:00:00.000Z", version: 8, notificationStatus: "pending", after: snapshot() }
}
const confirmBody = () => ({ operationId: opId, expectedVersion: 7 })
const previewBody = () => ({ operationId: opId, action: "extend_or_grant", days: 7, plan: "business_control",
  reason: "Approved evaluation", timeZone: "Australia/Melbourne", expectedVersion: 7 })
function req(action: string, body: unknown = {}, headers: Row = {}, query = ""): NextRequest {
  const path = action === "legacy" ? "actions/extend-trial" : "trial-access"
  return new Request(`https://paidsoon.test/api/admin/tenants/${tenant}/${path}${query}`, {
    method: ["snapshot", "status"].includes(action) ? "GET" : "POST",
    headers: { Origin: "https://paidsoon.test", "Content-Type": "application/json", ...headers } as Record<string, string>,
    ...(["snapshot", "status"].includes(action) ? {} : { body: JSON.stringify(body) }),
  }) as NextRequest
}
async function invoke(action: string, body: unknown = {}, headers: Row = {}, params = { id: tenant, operationId: opId }, query = "") {
  return handlers[action](req(action, body, headers, query), { params: Promise.resolve(params) })
}
function noTargetReads(): void {
  assert.ok(!reads.some((read) => ["tenant", "operation", "grant", "notification", "risks"].includes(read)), reads.join(","))
  assert.equal(writes, 0); assert.deepEqual(calls, [])
}

before(async () => {
  mock.module("server-only", { namedExports: {}, defaultExport: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: db } })
  mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: {
    getUser: async () => ({ data: { user: authenticated ? { id: authenticated, email: "owner@example.test" } : null }, error: null }),
  } }) } })
  mock.module("next/headers", { namedExports: { cookies: async () => ({ get: (name: string) =>
    name === "admin_session" && cookie ? { value: cookie } : undefined }) } })
  mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: () => {
    calls.push("stripe-client")
    if (providerFail) throw new Error("private stripe key")
    return { customers: { retrieve: async () => { calls.push("stripe-read"); throw new Error("private provider params") } } }
  } } })
  mock.module("@/lib/email/trialAccessContactService", { namedExports: { createTrialAccessContactService: () => ({
    resolve: async () => { calls.push("contact-read"); return { email: "verified@example.test", name: "Billing owner", source: "stripe_billing", nameMissing: false } },
    freeze: async () => { throw new Error("GET MUST NOT FREEZE") },
  }) } })
  // Keep real guard, real cookie/session helpers, preview validation/journaling,
  // real eligibility and effective-access resolver. Only side-effect services
  // are mocked; their transaction/saga/delivery internals have dedicated suites.
  const service = (label: string) => ({ confirm: async (_tenant: string, body: unknown, meta: Row) => {
    calls.push(label); receivedMeta = meta; receivedBody = structuredClone(body)
    if (thrown) throw thrown
    return structuredClone(outcome)
  } })
  mock.module("@/lib/billing/trialAccessOperations", { namedExports: { createTrialAccessOperationService: () => service("local-confirm") } })
  mock.module("@/lib/billing/stripeTrialExtension", { namedExports: { createStripeTrialExtensionService: () => service("stripe-confirm") } })
  mock.module("@/lib/billing/stripeTrialRecovery", { namedExports: { createStripeTrialRecoveryService: (deps: { authorize: () => Promise<AdminGuardContext> }) => ({
    reconcile: async (_tenant: string, _operation: string, body: Row, meta: Row) => {
      await deps.authorize(); assert.deepEqual(body, {}); receivedMeta = meta; calls.push("stripe-reconcile")
      if (thrown) throw thrown
      return structuredClone(outcome)
    },
  }) } })
  mock.module("@/lib/email/trialAccessDelivery", { namedExports: { createTrialAccessDeliveryService: () => ({
    retry: async (_tenant: string, _operation: string, meta: Row) => {
      calls.push("notification-retry"); receivedMeta = meta
      if (thrown) throw thrown
      return { status: "failed", failureCode: "private provider detail", recipientEmail: "secret@example.test" }
    },
  }) } })
  previewModule = await import("@/lib/billing/trialAccessPreview")
  fenceModule = await import("@/lib/billing/tenantBillingFence")
  handlers = {
    snapshot: (await import("@/app/api/admin/tenants/[id]/trial-access/route")).GET,
    preview: (await import("@/app/api/admin/tenants/[id]/trial-access/preview/route")).POST,
    confirm: (await import("@/app/api/admin/tenants/[id]/trial-access/operations/route")).POST,
    status: (await import("@/app/api/admin/tenants/[id]/trial-access/operations/[operationId]/route")).GET,
    reconcile: (await import("@/app/api/admin/tenants/[id]/trial-access/operations/[operationId]/reconcile/route")).POST,
    retry: (await import("@/app/api/admin/tenants/[id]/trial-access/operations/[operationId]/notification/retry/route")).POST,
    legacy: (await import("@/app/api/admin/tenants/[id]/actions/extend-trial/route")).POST,
  }
})

beforeEach(() => {
  authenticated = actor; cookie = "valid-cookie"
  role = { userId: actor, role: "platform_owner", status: "active" }
  session = { id: "session-original", userId: actor, sessionToken: cookie, adminDeviceId: "device-1",
    expiresAt: future(), revokedAt: null, impersonatedTenantId: null, impersonatedUserId: null }
  device = { id: "device-1", adminUserId: actor, status: "active", revokedAt: null }
  profile = { userId: tenant, displayName: "Test business", stripeCustomerId: null, stripeSubscriptionId: null,
    stripePriceId: null, subscriptionTier: "essentials", subscriptionStatus: "trialing", trialEndsAt: future(),
    billingAccessVersion: 7, pendingTrialOperationId: null, pendingBillingMutationId: null,
    subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null, subscriptionCancelAt: null,
    subscriptionCancelAtPeriodEnd: false, stripeScheduleId: null, pendingDowngradeTier: null,
    stripeAccessToken: "PRIVATE", email: "secret@example.test" }
  outcome = success()
  operation = { id: opId, userId: tenant, actorUserId: actor, adminSessionId: "session-original", source: "admin_grant",
    action: "extend_or_grant", status: "succeeded", result: success(), createdAt: new Date(), completedAt: new Date(),
    previewExpiresAt: future(), previewVersion: 7, reason: "PRIVATE", stripeIdempotencyKey: "PRIVATE" }
  grant = null; notification = { userId: tenant, operationId: opId, status: "sent", recipientEmail: "PRIVATE" }
  reads = []; calls = []; writes = 0; providerFail = false; persistenceFail = false; thrown = null; receivedMeta = null; receivedBody = null; risks = []
})

describe("trial management: actual three-layer guard plus device/impersonation", () => {
  const failures: [string, () => void, number][] = [
    ["unauthenticated", () => { authenticated = null }, 401],
    ["no role", () => { role = null }, 403],
    ["support", () => { role!.role = "platform_support" }, 403],
    ["admin", () => { role!.role = "platform_admin" }, 403],
    ["disabled owner", () => { role!.status = "disabled" }, 403],
    ["missing elevation cookie", () => { cookie = "" }, 401],
    ["unknown cookie", () => { cookie = "wrong" }, 401],
    ["mismatched cookie actor", () => { session!.userId = other }, 401],
    ["expired elevation", () => { session!.expiresAt = new Date(0) }, 403],
    ["revoked elevation", () => { session!.revokedAt = new Date() }, 403],
    ["invalid device", () => { device = null }, 403],
    ["foreign device", () => { device!.adminUserId = other }, 403],
    ["pending device", () => { device!.status = "pending" }, 403],
    ["expired device", () => { device!.status = "expired" }, 403],
    ["revoked device", () => { device!.status = "revoked" }, 403],
    ["active device with revocation timestamp", () => { device!.revokedAt = new Date() }, 403],
    ["support-console impersonation", () => { session!.impersonatedUserId = tenant }, 403],
    ["legacy impersonation", () => { session!.impersonatedTenantId = tenant }, 403],
  ]
  for (const action of ["snapshot", "preview", "confirm", "status", "reconcile", "retry", "legacy"]) {
    for (const [label, change, expected] of failures) test(`${action}: ${label} rejected before target reads`, async () => {
      change()
      const result = await invoke(action, { malicious: true })
      assert.equal(result.status, expected)
      noTargetReads()
    })
  }
  test("support user cannot gain owner authority with support-session URL hints", async () => {
    role!.role = "platform_support"
    const result = await invoke("confirm", confirmBody(), {}, undefined, "?support_view=true&support_session=session-original")
    assert.equal(result.status, 403); noTargetReads()
  })
  for (const staffRole of ["platform_support", "platform_admin"]) {
    for (const action of ["snapshot", "preview", "confirm", "status", "reconcile", "retry", "legacy"]) {
      test(`${action}: elevated ${staffRole} gets 403 with an otherwise valid request`, async () => {
        role!.role = staffRole
        const body = action === "preview" ? previewBody()
          : ["confirm", "legacy"].includes(action) ? confirmBody() : {}
        const result = await invoke(action, body)
        assert.equal(result.status, 403)
        noTargetReads()
      })
    }
    test(`legacy: elevated ${staffRole} cannot use the removed diagnostic days payload`, async () => {
      role!.role = staffRole
      const result = await invoke("legacy", { days: 7 })
      assert.equal(result.status, 403)
      noTargetReads()
    })
  }
})

describe("strict route boundary and origin", () => {
  for (const action of ["preview", "confirm", "reconcile", "retry", "legacy"]) {
    for (const origin of ["", "null", "https://evil.test", "https://paidsoon.test.evil.test"]) test(`${action}: rejects origin ${origin}`, async () => {
      assert.equal((await invoke(action, {}, { Origin: origin, "x-forwarded-host": "evil.test" })).status, 403); noTargetReads()
    })
    test(`${action}: rejects cross-site Fetch Metadata`, async () => {
      assert.equal((await invoke(action, {}, { "sec-fetch-site": "cross-site" })).status, 403); noTargetReads()
    })
    test(`${action}: rejects malformed JSON`, async () => {
      const request = new Request("https://paidsoon.test/api/admin/trial", { method: "POST", headers: { Origin: "https://paidsoon.test" }, body: "{" })
      assert.equal((await handlers[action](request as NextRequest, { params: Promise.resolve({ id: tenant, operationId: opId }) })).status, 400)
      noTargetReads()
    })
  }
  for (const action of ["reconcile", "retry"]) for (const body of [null, [], "", { source: "admin_grant" }, { days: 30 }, { operationId: opId }]) {
    test(`${action}: strict empty object rejects ${JSON.stringify(body)}`, async () => {
      assert.equal((await invoke(action, body)).status, 400); noTargetReads()
    })
  }
  for (const body of [{ ...confirmBody(), days: 7 }, { ...confirmBody(), source: "stripe_trial" },
    { ...confirmBody(), reason: "override" }, { ...confirmBody(), expectedVersion: -1 }, { ...confirmBody(), operationId: "not-uuid" }]) {
    test(`confirmation strict envelope ${JSON.stringify(body)}`, async () => {
      assert.equal((await invoke("confirm", body)).status, 400); noTargetReads()
    })
  }
  test("preview rejects injected source and invalid timezone/date/plan before any journal write", async () => {
    for (const patch of [{ source: "admin_grant" }, { timeZone: "invalid" }, { plan: "accountant_partner" },
      { days: undefined, expiresAt: "2026-02-30T12:00:00+11:00" }]) {
      assert.equal((await invoke("preview", { ...previewBody(), ...patch })).status, 400)
    }
    noTargetReads()
  })
  test("UUID paths and unsupported query rejected", async () => {
    for (const action of Object.keys(handlers)) {
      assert.equal((await invoke(action, {}, {}, { id: "invalid", operationId: opId })).status, 400)
      assert.equal((await invoke(action, {}, {}, undefined, "?source=admin_grant")).status, 400)
    }
    noTargetReads()
  })
})

describe("scoped operation dispatch and session clarification", () => {
  for (const action of ["confirm", "status", "reconcile", "retry", "legacy"]) {
    for (const field of ["userId", "actorUserId", "id"]) test(`${action}: foreign ${field} is scoped 404`, async () => {
      operation![field] = other
      assert.equal((await invoke(action, ["confirm", "legacy"].includes(action) ? confirmBody() : {})).status, 404)
      assert.deepEqual(calls, []); assert.equal(writes, 0)
    })
  }
  test("confirmation dispatches exclusively from server journal source", async () => {
    assert.equal((await invoke("confirm", confirmBody())).status, 200)
    assert.deepEqual(calls, ["local-confirm"])
    operation!.source = "stripe_trial"; outcome = success("stripe_trial"); calls = []
    assert.equal((await invoke("confirm", confirmBody())).status, 200)
    assert.deepEqual(calls, ["stripe-confirm"])
  })
  test("status and recovery accept new current session of original actor; journal original session unchanged", async () => {
    session!.id = "session-fresh"; cookie = "fresh-cookie"; session!.sessionToken = cookie
    operation!.source = "stripe_trial"; operation!.status = "pending"; operation!.result = null
    outcome = { operationId: opId, source: "stripe_trial", status: "reconciliation_required", reconciliationRequired: true }
    assert.equal((await invoke("status")).status, 202)
    assert.equal((await invoke("reconcile")).status, 202)
    assert.equal(operation!.adminSessionId, "session-original")
    assert.deepEqual(calls, ["stripe-reconcile"])
    assert.equal(writes, 0)
  })
  for (const action of ["confirm", "retry", "legacy"]) test(`${action} STILL requires original session`, async () => {
    session!.id = "session-fresh"
    assert.equal((await invoke(action, ["confirm", "legacy"].includes(action) ? confirmBody() : {})).status, 404)
    assert.deepEqual(calls, [])
  })
  test("different currently elevated owner cannot substitute original actor", async () => {
    authenticated = other; role!.userId = other; session!.userId = other; device!.adminUserId = other
    assert.equal((await invoke("status")).status, 404)
    assert.equal((await invoke("reconcile")).status, 404)
    assert.deepEqual(calls, [])
  })
  test("local terminal recovery is read-only replay, never confirmation; preview recovery conflicts", async () => {
    assert.equal((await invoke("reconcile")).status, 200)
    operation!.status = "previewed"; operation!.result = null
    assert.equal((await invoke("reconcile")).status, 409)
    assert.deepEqual(calls, []); assert.equal(writes, 0)
  })
  test("retry only invokes delivery, strict safe separate notification projection", async () => {
    const beforeResult = structuredClone(operation!.result)
    const result = await invoke("retry")
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), { operationId: opId, notification: { status: "failed" } })
    assert.deepEqual(calls, ["notification-retry"])
    assert.deepEqual(operation!.result, beforeResult); assert.equal(writes, 0)
  })
  test("uppercase UUID normalization retains tenant/operation scoping", async () => {
    assert.equal((await invoke("status", {}, {}, { id: tenant.toUpperCase(), operationId: opId.toUpperCase() })).status, 200)
  })
})

describe("safe readonly management and immutable access/delivery results", () => {
  test("management separates persisted billing/effective grant/contact provenance and performs no writes", async () => {
    grant = { userId: tenant, plan: "small_business", startsAt: new Date(0), expiresAt: future(), revokedAt: null,
      creatorOperationId: "PRIVATE" }
    const result = await invoke("snapshot")
    assert.equal(result.status, 200)
    const body = await result.json()
    assert.deepEqual(body.tenant, { displayName: "Test business", labelSource: "display_name" })
    assert.equal(body.contact.email, "verified@example.test"); assert.equal(body.contact.source, "stripe_billing")
    assert.equal(body.billing.plan, "essentials"); assert.equal(body.access.effectivePlan, "small_business")
    assert.equal(body.eligibility.available, true); assert.equal(body.eligibility.eligible, true)
    assert.equal(body.version, 7); assert.equal(writes, 0); assert.deepEqual(calls, ["contact-read"])
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE|creatorOperation|stripeCustomerId|reason|secret@example/)
  })
  for (const constructionFailure of [false, true]) test(`provider ${constructionFailure ? "construction" : "read"} failure is available:false, not eligible local grant`, async () => {
    profile!.stripeCustomerId = "cus_private"; providerFail = constructionFailure
    const result = await invoke("snapshot"), body = await result.json()
    assert.equal(result.status, 200)
    assert.equal(body.eligibility.available, false); assert.equal(body.eligibility.eligible, false)
    assert.equal(body.eligibility.source, null); assert.equal(body.eligibility.allowedActions.extendOrGrant, false)
    assert.equal(writes, 0); assert.doesNotMatch(JSON.stringify(body), /cus_private|private stripe|private provider/)
  })
  test("billing restrictions prohibit extending but permit revoking a local grant", async () => {
    profile!.subscriptionStatus = "active"
    grant = { userId: tenant, plan: "small_business", startsAt: new Date(0), expiresAt: future(), revokedAt: null }
    const body = await (await invoke("snapshot")).json()
    assert.equal(body.eligibility.allowedActions.extendOrGrant, false)
    assert.equal(body.eligibility.allowedActions.revokeGrant, true)
    operation!.action = "revoke_grant"; outcome = { ...success(), action: "revoke_grant" }
    assert.equal((await invoke("confirm", confirmBody())).status, 200)
    assert.ok(calls.includes("local-confirm"))
  })
  for (const reservation of ["pendingBillingMutationId", "pendingTrialOperationId"]) test(`management actions respect ${reservation}`, async () => {
    profile![reservation] = "private-operation"
    const body = await (await invoke("snapshot")).json()
    assert.equal(body.eligibility.eligible, false); assert.equal(body.eligibility.allowedActions.extendOrGrant, false)
    assert.doesNotMatch(JSON.stringify(body), /private-operation/)
  })
  test("GET status never calls provider/recovery/delivery and separates later mail status from immutable result", async () => {
    operation!.result = { ...success(), reason: "PRIVATE", after: { ...snapshot(), stripeIdempotencyKey: "PRIVATE",
      grant: { ...snapshot().grant, creatorOperationId: "PRIVATE" } } }
    const original = structuredClone(operation!.result)
    const response = await invoke("status"), body = await response.json()
    assert.equal(body.result.notificationStatus, "pending"); assert.equal(body.notificationStatus, "sent")
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE|reason|creatorOperation|stripeIdempotencyKey|recipientEmail/)
    assert.deepEqual(operation!.result, original); assert.deepEqual(calls, []); assert.equal(writes, 0)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
  })
  test("completed access remains 200 even when mail failed; neither raw failure details nor keys escape", async () => {
    outcome = { ...success(), notification: { status: "failed", failureCode: "private mail recipient" }, reason: "PRIVATE",
      after: { ...snapshot(), rawProviderParams: "PRIVATE" } }
    const response = await invoke("confirm", confirmBody()), body = await response.json()
    assert.equal(response.status, 200); assert.equal(body.status, "succeeded")
    assert.equal(body.notificationStatus, "pending"); assert.deepEqual(body.notification, { status: "failed" })
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE|private mail/)
  })
  test("preview really journals frozen intent, but never changes access or sends/freezes mail", async () => {
    operation = null
    const result = await invoke("preview", previewBody()), body = await result.json()
    assert.equal(result.status, 200)
    assert.equal(body.source, "admin_grant"); assert.equal(body.billingEffect, "application_access_only")
    assert.equal(body.target.timeZone, "Australia/Melbourne"); assert.match(body.target.offset, /^\+1[01]:00$/)
    assert.equal(writes, 1); assert.ok(calls.every((call) => call === "lock"))
    assert.equal(profile!.billingAccessVersion, 7); assert.equal(notification!.status, "sent")
    assert.doesNotMatch(JSON.stringify(body), /Approved evaluation|reason|inputHash|adminSessionId/)
  })
})

describe("task 4.7 legacy Stripe-only confirmation adapter", () => {
  for (const body of [null, [], {}, { days: 7 }, { days: 14, reason: "Legacy" }, { ...confirmBody(), days: 7 },
    { ...confirmBody(), reason: "Replace reason" }, { ...confirmBody(), source: "stripe_trial" },
    { ...confirmBody(), action: "extend_or_grant" }, { ...confirmBody(), notify: true },
    { operationId: opId }, { expectedVersion: 7 }, { ...confirmBody(), expectedVersion: -1 },
    { ...confirmBody(), operationId: "invalid" }, { ...confirmBody(), expectedVersion: "7" }]) {
    test(`strict envelope rejects ${JSON.stringify(body)} before target reads`, async () => {
      assert.equal((await invoke("legacy", body)).status, 400)
      noTargetReads()
    })
  }
  test("confirmation cannot invent a preview or provide its own reason", async () => {
    operation = null
    assert.equal((await invoke("legacy", confirmBody())).status, 404)
    assert.deepEqual(calls, []); assert.equal(writes, 0)
    for (const reason of [undefined, "", "   ", "x".repeat(1001)]) {
      assert.equal((await invoke("preview", { ...previewBody(), reason })).status, 400)
    }
    assert.equal(writes, 0)
  })
  for (const source of ["admin_grant", "onboarding_trial", "paid", "none"]) {
    test(`server journal ${source} cannot fall back to a local grant, including completed replay`, async () => {
      operation!.source = source
      const before = structuredClone(operation)
      const result = await invoke("legacy", confirmBody())
      assert.equal(result.status, 409)
      assert.deepEqual(await result.json(), { error: "trial_stripe_intent_required" })
      assert.deepEqual(operation, before); assert.deepEqual(calls, []); assert.equal(writes, 0)
    })
  }
  test("Stripe-source revocation is not extension intent", async () => {
    operation!.source = "stripe_trial"; operation!.action = "revoke_grant"
    assert.equal((await invoke("legacy", confirmBody())).status, 409)
    assert.deepEqual(calls, []); assert.equal(writes, 0)
  })
  test("passes only the safety envelope and server metadata to the same Stripe saga, with journal reason unchanged", async () => {
    operation!.source = "stripe_trial"; operation!.reason = "Approved original reason"
    outcome = success("stripe_trial")
    const before = structuredClone(operation)
    const result = await invoke("legacy", confirmBody(), { "x-forwarded-for": "203.0.113.4", "user-agent": "legacy-test" })
    assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store")
    assert.deepEqual(calls, ["stripe-confirm"]); assert.deepEqual(receivedBody, confirmBody())
    assert.equal(receivedMeta!.ipAddress, "203.0.113.4"); assert.equal(receivedMeta!.userAgent, "legacy-test")
    assert.match(receivedMeta!.requestId as string, /^[a-f0-9]{16}$/)
    assert.deepEqual(operation, before); assert.equal(writes, 0)
    assert.doesNotMatch(JSON.stringify(await result.json()), /Approved original reason|stripeIdempotencyKey|adminSessionId/)
  })
  for (const status of [400, 404, 409, 503] as const) test(`shared service ${status} remains ${status}`, async () => {
    operation!.source = "stripe_trial"
    thrown = new previewModule.TrialPreviewError("trial_safe_code", status)
    assert.equal((await invoke("legacy", confirmBody())).status, status)
    assert.deepEqual(calls, ["stripe-confirm"]); assert.equal(writes, 0)
  })
  test("billing concurrency conflicts cannot dispatch a local fallback", async () => {
    operation!.source = "stripe_trial"
    thrown = new fenceModule.TenantBillingConflictError("billing_operation_in_progress")
    assert.equal((await invoke("legacy", confirmBody())).status, 409)
    assert.deepEqual(calls, ["stripe-confirm"])
  })
  for (const status of ["pending", "reconciliation_required", "failed", "succeeded"]) {
    test(`safe ${status} outcome retains shared HTTP mapping`, async () => {
      operation!.source = "stripe_trial"
      outcome = status === "succeeded" ? success("stripe_trial") : { operationId: opId, source: "stripe_trial", status,
        ...(status === "failed" ? { failureCode: "provider_rejected" } : { reconciliationRequired: true }) }
      assert.equal((await invoke("legacy", confirmBody())).status, status === "failed" ? 502 : status === "succeeded" ? 200 : 202)
      assert.deepEqual(calls, ["stripe-confirm"]); assert.equal(writes, 0)
    })
  }
  test("unknown errors are redacted 503, never local grants", async () => {
    operation!.source = "stripe_trial"; thrown = new Error("private stripe key customer@example.test")
    const log = mock.method(console, "error", () => {})
    try {
      const result = await invoke("legacy", confirmBody())
      assert.equal(result.status, 503)
      assert.deepEqual(await result.json(), { error: "trial_operation_unavailable" })
      assert.deepEqual(calls, ["stripe-confirm"])
    } finally { log.mock.restore() }
  })
})

describe("D4 transport statuses and audit metadata", () => {
  test("400 service validation, 404 missing, 409 conflict, 503 persistence are distinct", async () => {
    for (const code of [400, 404, 409, 503] as const) {
      thrown = new previewModule.TrialPreviewError("trial_safe_code", code)
      assert.equal((await invoke("confirm", confirmBody())).status, code)
    }
    thrown = null; profile = null
    assert.equal((await invoke("snapshot")).status, 404)
  })
  test("billing fence conflict is 409", async () => {
    thrown = new fenceModule.TenantBillingConflictError("billing_operation_in_progress")
    assert.equal((await invoke("confirm", confirmBody())).status, 409)
  })
  for (const status of ["pending", "reconciliation_required"]) test(`${status} accepted unknown is 202`, async () => {
    operation!.source = "stripe_trial"; outcome = { operationId: opId, source: "stripe_trial", status, reconciliationRequired: true }
    assert.equal((await invoke("confirm", confirmBody())).status, 202)
    assert.equal((await invoke("reconcile")).status, 202)
  })
  test("definitive provider rejection is 502 and safe terminal replay", async () => {
    operation!.source = "stripe_trial"; outcome = { operationId: opId, source: "stripe_trial", status: "failed", failureCode: "provider_rejected", key: "PRIVATE" }
    const result = await invoke("confirm", confirmBody())
    assert.equal(result.status, 502); assert.doesNotMatch(JSON.stringify(await result.json()), /PRIVATE/)
    operation!.status = "failed"; operation!.result = outcome
    assert.equal((await invoke("status")).status, 502)
    assert.equal(writes, 0)
  })
  test("unknown provider/storage errors and malformed stored results are safe 503", async () => {
    thrown = new Error("private secret customer@example.test")
    const log = mock.method(console, "error", () => {})
    const result = await invoke("confirm", confirmBody())
    assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(await result.json()), /private|customer@/)
    assert.equal(log.mock.calls[0].arguments[0], "[trial management] Request unavailable")
    thrown = null; operation!.result = { reason: "PRIVATE" }
    assert.equal((await invoke("status")).status, 503)
    log.mock.restore()
  })
  test("canonical server header metadata, never client body metadata, reaches business service", async () => {
    await invoke("confirm", confirmBody(), { "x-forwarded-for": "203.0.113.4, 10.0.0.1", "user-agent": "route-test" })
    assert.equal(receivedMeta!.ipAddress, "203.0.113.4")
    assert.equal(receivedMeta!.userAgent, "route-test")
    assert.match(receivedMeta!.requestId as string, /^[a-f0-9]{16}$/)
  })
})