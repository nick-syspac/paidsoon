import { before, beforeEach, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { EffectiveAccessProfile, TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"
import { getPublicPlans } from "@/lib/subscriptionPlans"

// Real route wrappers, access loader/resolver, feature and combined source counters.
// Only I/O is mocked: none of these tests contact a database or provider.
type Handler = (request: Request) => Promise<Response>
type Query = { where: Record<string, unknown>; data?: Record<string, unknown>; create?: Record<string, unknown> }
const app = "https://paidsoon.test"
const owner = "source-owner"
let user: { id: string } | null
let profile: EffectiveAccessProfile
let grant: TrialGrantSnapshot | null
let risks: BillingRiskSnapshot[]
let stripeCount = 0
let accountingCount = 0
let existing = false
let writes = 0
let providerCalls = 0
let nonceWrites = 0
let syncs = 0
let source = "xero"
let afterOAuth: () => void = () => {}
let pendingOwner = owner
let pendingDeleted = false
let countQueries: Query[] = []
let profileReads = 0
let expireOnProfileRead = 0
const routes: { name: string; source: string; path: string; handler: Handler }[] = []

function assertTenant(query: Query): void {
  assert.equal(query.where.userId, owner)
}
const tx = {
  userProfile: { findUnique: async (query: Query) => {
    assertTenant(query)
    if (++profileReads === expireOnProfileRead && grant) grant.expiresAt = new Date(0)
    return profile
  } },
  tenantTrialGrant: { findUnique: async (query: Query) => { assertTenant(query); return grant } },
  tenantBillingRisk: { findMany: async (query: Query) => { assertTenant(query); return risks } },
  invoiceConnection: {
    count: async (query: Query) => { assertTenant(query); countQueries.push(query); return stripeCount },
    findFirst: async (query: Query) => { assertTenant(query); assert.equal(query.where.provider, "stripe"); return existing ? { id: "existing-stripe" } : null },
    update: async (query: Query) => { assert.deepEqual(query, { where: { id: "existing-stripe" }, data: { isActive: true } }); writes++; return {} },
    create: async (query: Query) => { assert.equal(query.data?.userId, owner); writes++; return { id: "new-stripe" } },
  },
  accountingConnection: {
    count: async (query: Query) => { assertTenant(query); countQueries.push(query); return accountingCount },
    findUnique: async (query: Query) => {
      assert.equal((query.where.userId_provider_organisationId as Record<string, unknown>).userId, owner)
      return existing ? { id: "existing-accounting" } : null
    },
    upsert: async (query: Query) => {
      assert.equal((query.where.userId_provider_organisationId as Record<string, unknown>).userId, owner)
      assert.equal(query.create?.userId, owner)
      writes++; return { id: "saved-accounting" }
    },
  },
}
function pending(): string {
  return JSON.stringify({ userId: pendingOwner, organisations: [{ id: "org", name: "Mock org" }],
    encryptedAccessToken: "encrypted", encryptedRefreshToken: "encrypted", tokenExpiresAt: "2099-01-01T00:00:00Z", scopes: "mock" })
}
before(async () => {
  process.env.NEXT_PUBLIC_APP_URL = app
  process.env.STRIPE_SECRET_KEY = "sk_test_mock_only"
  process.env.STRIPE_CONNECT_CLIENT_ID = "ca_mock"
  process.env.XERO_REDIRECT_URI = `${app}/api/integrations/xero/callback`
  process.env.MYOB_REDIRECT_URI = `${app}/api/integrations/myob/callback`
  await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) } })
  await mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext: async (userId: string, fn: (client: typeof tx) => Promise<unknown>) => {
    assert.equal(userId, owner); return fn(tx)
  } } })
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: { oauthState: {
    findUnique: async () => ({ userId: owner, provider: source, expiresAt: new Date("2099-01-01") }),
    delete: async () => ({}), create: async () => { nonceWrites++; return {} },
  } } } })
  await mock.module("stripe", { defaultExport: class {
    oauth = { token: async () => { providerCalls++; afterOAuth(); return { stripe_user_id: "acct_mock" } } }
  } })
  await mock.module("@/lib/providers/accounting", { namedExports: { getAccountingProvider: () => ({
    getAuthorizationUrl: () => { providerCalls++; return "https://provider.test/authorize" },
    exchangeCodeForTokens: async () => { providerCalls++; afterOAuth(); return { accessToken: "mock", refreshToken: "mock", expiresIn: 600 } },
    getOrganisations: async () => [{ id: "org", name: "Mock org" }],
  }) } })
  await mock.module("@/lib/providers/accounting/crypto", { namedExports: { encryptToken: () => "encrypted" } })
  await mock.module("@/lib/providers/accounting/triggerSyncNow", { namedExports: { triggerSyncNow: async () => { syncs++ } } })
  await mock.module("@/lib/providers/accounting/sync", { namedExports: { syncConnection: async () => { syncs++ } } })
  await mock.module("next/headers", { namedExports: { cookies: async () => ({ get: () => ({ value: pending() }), delete: () => { pendingDeleted = true }, set: () => {} }) } })
  routes.push(
    { name: "Stripe authorize", source: "stripe", path: "/api/stripe/connect/authorize", handler: (await import("@/app/api/stripe/connect/authorize/route")).GET },
    { name: "Stripe callback", source: "stripe", path: "/api/stripe/connect/callback", handler: (await import("@/app/api/stripe/connect/callback/route")).GET },
    { name: "Xero connect", source: "xero", path: "/api/integrations/xero/connect", handler: (await import("@/app/api/integrations/xero/connect/route")).GET },
    { name: "Xero callback", source: "xero", path: "/api/integrations/xero/callback", handler: (await import("@/app/api/integrations/xero/callback/route")).GET },
    { name: "Xero select-org", source: "xero", path: "/api/integrations/xero/select-org", handler: (await import("@/app/api/integrations/xero/select-org/route")).POST },
    { name: "MYOB connect", source: "myob", path: "/api/integrations/myob/connect", handler: (await import("@/app/api/integrations/myob/connect/route")).GET },
    { name: "MYOB callback", source: "myob", path: "/api/integrations/myob/callback", handler: (await import("@/app/api/integrations/myob/callback/route")).GET },
  )
})
beforeEach(() => {
  user = { id: owner }
  profile = { subscriptionStatus: "paused", subscriptionTier: "business_pro", stripeSubscriptionId: "sub_untouched", trialEndsAt: null, billingAccessVersion: 9 }
  grant = { plan: "essentials", startsAt: new Date("2020-01-01"), expiresAt: new Date("2099-01-01"), revokedAt: null }
  risks = []; stripeCount = 0; accountingCount = 0; existing = false; writes = 0; providerCalls = 0; nonceWrites = 0; syncs = 0
  afterOAuth = () => {}; pendingOwner = owner; pendingDeleted = false; countQueries = []
  profileReads = 0; expireOnProfileRead = 0
})
function requestFor(route: (typeof routes)[number]): Request {
  source = route.source
  if (route.name.endsWith("select-org")) {
    const body = new FormData(); body.set("key", "pending"); body.set("organisationId", "org")
    return new Request(`${app}${route.path}`, { method: "POST", body })
  }
  return new Request(`${app}${route.path}?code=mock&state=${route.source === "stripe" ? owner : "nonce"}&businessId=org&plan=business_pro`)
}

// Register subtests after before() has imported every actual route.
test("all seven source paths enforce each granted plan's cap, not inactive raw tier or selected intent", async (t) => {
  for (const route of routes) for (const plan of getPublicPlans()) {
    await t.test(`${route.name}: ${plan.id} cap ${plan.limits.connectedInvoiceSources}`, async () => {
      grant!.plan = plan.id
      profile.subscriptionStatus = "paused"
      profile.subscriptionTier = plan.id === "business_pro" ? "essentials" : "business_pro"
      const unchanged = structuredClone(profile)
      const cap = plan.limits.connectedInvoiceSources
      stripeCount = cap - 1; accountingCount = 1; writes = 0; nonceWrites = 0; countQueries = []
      const denied = await route.handler(requestFor(route))
      assert.match(denied.headers.get("location") ?? "", /code=connection_limit_reached/)
      assert.equal(writes, 0); assert.equal(nonceWrites, 0); assert.equal(syncs, 0)
      assert.deepEqual(profile, unchanged)
      assert.deepEqual(countQueries, [
        { where: { userId: owner, provider: "stripe", isActive: true } },
        { where: { userId: owner, status: { notIn: ["disconnected", "revoked"] } } },
      ])
      accountingCount = 0
      const allowed = await route.handler(requestFor(route))
      assert.equal(allowed.status, 307)
      if (/callback|select-org/.test(route.name)) { assert.equal(writes, 1); assert.match(allowed.headers.get("location") ?? "", /code=connected/) }
      else assert.match(allowed.headers.get("location") ?? "", /authorize/)
      assert.deepEqual(profile, unchanged, "OAuth must not resume paused billing or write tier/version")
    })
  }
})

test("denied, expired, revoked and billing-restricted grants fail closed on all seven wrapped paths", async (t) => {
  for (const route of routes) for (const denial of ["expired", "revoked", "absent", "risk", "unpaid"] as const) {
    await t.test(`${route.name}: ${denial}`, async () => {
      if (denial === "expired") grant!.expiresAt = new Date(0)
      if (denial === "revoked") grant!.revokedAt = new Date("2020-01-02")
      if (denial === "absent") grant = null
      if (denial === "risk") risks = [{ kind: "subscription_invoice", stripeStatus: "uncollectible", blocking: true }]
      if (denial === "unpaid") profile.subscriptionStatus = "unpaid"
      const result = await route.handler(requestFor(route))
      assert.equal(result.status, 403); assert.equal((await result.json()).effectiveTier, null)
      assert.equal(providerCalls, 0); assert.equal(writes, 0); assert.equal(nonceWrites, 0); assert.equal(syncs, 0); assert.deepEqual(countQueries, [])
    })
  }
})

test("OAuth callbacks recheck expiry and changed plan after the asynchronous exchange before new or reconnect writes", async (t) => {
  for (const route of routes.filter((entry) => entry.name.endsWith("callback"))) for (const reconnect of [false, true]) for (const change of ["expire", "revoke", "lower-cap"] as const) {
    await t.test(`${route.name}: ${change}, reconnect=${reconnect}`, async () => {
      existing = reconnect; grant!.plan = "business_pro"; stripeCount = 1
      profile.subscriptionStatus = "canceled"
      const unchanged = structuredClone(profile)
      afterOAuth = () => {
        if (change === "expire") grant!.expiresAt = new Date(0)
        if (change === "revoke") grant!.revokedAt = new Date("2020-01-02")
        if (change === "lower-cap") grant!.plan = "essentials"
      }
      const result = await route.handler(requestFor(route))
      if (change !== "lower-cap") { assert.equal(result.status, 403); assert.equal(writes, 0) }
      else if (!reconnect) { assert.match(result.headers.get("location") ?? "", /connection_limit_reached/); assert.equal(writes, 0) }
      else { assert.match(result.headers.get("location") ?? "", /code=connected/); assert.equal(writes, 1) }
      assert.deepEqual(profile, unchanged, "canceled subscription stays canceled")
    })
  }
})

test("reconnects retain the existing at-cap exception on callbacks and Xero selection, but not authorization", async (t) => {
  for (const route of routes) await t.test(route.name, async () => {
    existing = true; stripeCount = 3
    const result = await route.handler(requestFor(route))
    const isWrite = /callback|select-org/.test(route.name)
    assert.match(result.headers.get("location") ?? "", isWrite ? /code=connected/ : /connection_limit_reached/)
    assert.equal(writes, isWrite ? 1 : 0)
  })
})

test("Xero selection denies fresh expired access, foreign pending tenants and unknown organisations without writes", async () => {
  const route = routes.find((entry) => entry.name === "Xero select-org")!
  pendingOwner = "another-tenant"
  let result = await route.handler(requestFor(route))
  assert.match(result.headers.get("location") ?? "", /invalid_selection/)
  assert.equal(writes, 0); assert.equal(pendingDeleted, true)
  pendingOwner = owner
  const body = new FormData(); body.set("key", "pending"); body.set("organisationId", "foreign-org")
  result = await route.handler(new Request(`${app}${route.path}`, { method: "POST", body }))
  assert.match(result.headers.get("location") ?? "", /invalid_selection/); assert.equal(writes, 0)
})

test("Xero selection rechecks expiry inside the connection transaction even after its outer guard allowed access", async () => {
  const route = routes.find((entry) => entry.name === "Xero select-org")!
  expireOnProfileRead = 2
  const result = await route.handler(requestFor(route))
  assert.equal(result.status, 403); assert.equal((await result.json()).effectiveTier, null)
  assert.equal(writes, 0); assert.equal(syncs, 0); assert.equal(pendingDeleted, false)
  assert.deepEqual(countQueries, [])
})

test("unauthenticated source entry points stop at the existing wrapper before I/O", async () => {
  user = null
  for (const route of routes) assert.equal((await route.handler(requestFor(route))).status, 401)
  assert.equal(providerCalls, 0); assert.equal(writes, 0); assert.equal(nonceWrites, 0)
})

test("authorization/connect reject a nullable fresh tier after the outer guard, without a catalog fallback or provider dispatch", async (t) => {
  for (const route of routes.filter((entry) => /authorize$|connect$/.test(entry.name))) await t.test(route.name, async () => {
    // Accounting connect retains its additional fresh requireFeature read.
    expireOnProfileRead = route.source === "stripe" ? 2 : 3
    const result = await route.handler(requestFor(route))
    assert.equal(result.status, 403); assert.equal((await result.json()).effectiveTier, null)
    assert.equal(providerCalls, 0); assert.equal(nonceWrites, 0); assert.equal(writes, 0)
    assert.deepEqual(countQueries, [])
  })
})