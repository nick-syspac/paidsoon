import { before, beforeEach, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { ReactElement } from "react"
import { resolveEffectiveAccess, type EffectiveAccessProfile, type TrialGrantSnapshot } from "@/lib/billing/effectiveAccess"
import { getPublicPlans } from "@/lib/subscriptionPlans"

const owner = "onboarding-owner"
let user: { id: string } | null
type Profile = EffectiveAccessProfile & { onboardingCompletedAt: Date | null; updatedAt: Date; pendingTrialOperationId: string | null; pendingBillingMutationId: string | null }
let profile: Profile | null
let grant: TrialGrantSnapshot | null
let writeFailure = false
let writes: { where: { userId: string }; data: Record<string, unknown>; select: unknown }[] = []
let reads: unknown[] = []
let patch: typeof import("@/app/api/onboarding/route").PATCH
let page: typeof import("@/app/onboarding/page").default
let checkout: typeof import("@/app/billing/checkout/page").default
let callback: typeof import("@/app/auth/callback/route").GET
const now = new Date("2026-10-17T12:00:00Z")
class Redirect extends Error { constructor(readonly destination: string) { super(destination) } }
before(async () => {
  await mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({ auth: {
    getUser: async () => ({ data: { user }, error: null }),
    exchangeCodeForSession: async () => ({ data: { user, session: null }, error: null }),
  } }) } })
  await mock.module("next/navigation", { namedExports: { redirect: (destination: string) => { throw new Redirect(destination) } } })
  await mock.module("@/lib/db/withUserContext", { namedExports: { withUserContext: async (userId: string, fn: (tx: unknown) => Promise<unknown>) => {
    assert.equal(userId, owner)
    return fn({ userProfile: {
      findUnique: async (query: { where: { userId: string } }) => { assert.equal(query.where.userId, owner); reads.push(query); return profile },
      update: async (query: (typeof writes)[number]) => {
        assert.equal(query.where.userId, owner)
        assert.deepEqual(Object.keys(query.data), ["onboardingCompletedAt"])
        writes.push(query)
        if (writeFailure || !profile) throw new Error("private database detail")
        Object.assign(profile, query.data, { updatedAt: new Date() })
        return { onboardingCompletedAt: profile.onboardingCompletedAt }
      },
    } })
  } } })
  await mock.module("@/components/onboarding/OnboardingPlanPicker", { namedExports: { OnboardingPlanPicker: () => null } })
  await mock.module("@/components/billing/StartCheckoutButton", { namedExports: { StartCheckoutButton: () => null } })
  await mock.module("@/lib/billing/billingClientSession", { namedExports: { getBillingClientScope: async () => "opaque-session" } })
  await mock.module("@/lib/actions/auth", { namedExports: { createUserProfile: async (userId: string) => { assert.equal(userId, owner) } } })
  // Existing callback bootstrap/read semantics stay unchanged, not reused by completion/page.
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: { userProfile: { findUnique: async () => profile } } } })
  await mock.module("@/lib/diagnostics/server", { namedExports: {
    applyTraceResponseHeaders: () => {}, createServerTraceContext: () => ({}), traceEvent: () => {}, warnIfProductionDebugEnabled: () => {},
    traceOperation: async (_context: unknown, _details: unknown, run: () => Promise<unknown>) => run(),
  } })
  ;({ PATCH: patch } = await import("@/app/api/onboarding/route"))
  ;({ default: page } = await import("@/app/onboarding/page"))
  ;({ default: checkout } = await import("@/app/billing/checkout/page"))
  ;({ GET: callback } = await import("@/app/auth/callback/route"))
})
beforeEach(() => {
  user = { id: owner }; writes = []; reads = []; writeFailure = false; grant = null
  profile = { subscriptionStatus: "trialing", subscriptionTier: "essentials", stripeSubscriptionId: null, trialEndsAt: new Date("2026-10-25T12:00:00Z"), billingAccessVersion: 17,
    onboardingCompletedAt: null, updatedAt: new Date("2026-10-17"), pendingTrialOperationId: "owner-reservation", pendingBillingMutationId: null }
})
function request(body: unknown): Request { return new Request("https://paidsoon.test/api/onboarding", { method: "PATCH", body: JSON.stringify(body) }) }
function access() { return resolveEffectiveAccess({ profile, grant, billingRisks: [] }, now) }
function billingProps(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || !("props" in node)) return null
  const props = (node as ReactElement<Record<string, unknown>>).props
  if ("billingAccessVersion" in props) return props
  for (const child of [props.children].flat(Infinity)) { const found = billingProps(child); if (found) return found }
  return null
}
for (const plan of getPublicPlans()) test(`actual onboarding PATCH records completion only for ${plan.id}; Essentials access stays unchanged`, async () => {
  const before = access()
  assert.equal((await patch(request({ tier: plan.id }))).status, 200)
  assert.equal(writes.length, 1); assert.ok(profile?.onboardingCompletedAt instanceof Date)
  assert.deepEqual(writes[0].select, { onboardingCompletedAt: true })
  assert.deepEqual(access(), before); assert.equal(access().effectiveTier, "essentials")
  assert.equal(profile?.billingAccessVersion, 17); assert.equal(profile?.pendingTrialOperationId, "owner-reservation")
})
for (const kind of ["grant", "stripe_trial", "paid", "expired", "denied"] as const) test(`completion/retry cannot change ${kind} access or paused/canceled billing`, async () => {
  if (kind === "grant") {
    profile!.subscriptionStatus = "paused"; profile!.stripeSubscriptionId = "sub_paused"
    grant = { plan: "business_pro", startsAt: new Date("2026-10-01"), expiresAt: new Date("2026-11-01"), revokedAt: null }
  }
  if (kind === "stripe_trial" || kind === "paid") { profile!.stripeSubscriptionId = "sub_verified"; profile!.subscriptionTier = "business_control"; profile!.subscriptionStatus = kind === "paid" ? "active" : "trialing" }
  if (kind === "expired") profile!.trialEndsAt = new Date("2026-10-16")
  if (kind === "denied") { profile!.subscriptionStatus = "canceled"; profile!.stripeSubscriptionId = "sub_canceled" }
  const before = access(); const authority = { ...profile }; delete (authority as Partial<Profile>).onboardingCompletedAt; delete (authority as Partial<Profile>).updatedAt
  for (const plan of getPublicPlans()) {
    assert.equal((await patch(request({ tier: plan.id }))).status, 200)
    assert.deepEqual(access(), before)
    const after = { ...profile }; delete (after as Partial<Profile>).onboardingCompletedAt; delete (after as Partial<Profile>).updatedAt
    assert.deepEqual(after, authority)
  }
})
test("invalid, hidden, legacy, malformed and unauthenticated completion inputs never write", async () => {
  for (const tier of ["accountant_partner", "unknown", "starter", "solo", "", null, 1]) assert.equal((await patch(request({ tier }))).status, 400)
  assert.equal((await patch(request({ tier: "business_pro", subscriptionStatus: "active" }))).status, 400)
  assert.equal((await patch(new Request("https://paidsoon.test/api/onboarding", { method: "PATCH", body: "{" }))).status, 400)
  user = null
  assert.equal((await patch(request({ tier: "business_pro" }))).status, 401)
  assert.equal(writes.length, 0)
})
test("failed or missing-profile completion returns safe unavailable response without bootstrap/upsert", async () => {
  writeFailure = true
  const before = structuredClone(profile)
  let response = await patch(request({ tier: "business_pro" }))
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private database/)
  assert.deepEqual(profile, before)
  profile = null
  response = await patch(request({ tier: "essentials" }))
  assert.equal(response.status, 503); assert.equal(profile, null)
})
test("onboarding page uses tenant RLS, skips completed/Stripe paid users, but does not mistake a grant or local active status for purchased access", async () => {
  assert.ok(await page())
  assert.deepEqual(reads, [{ where: { userId: owner }, select: { onboardingCompletedAt: true, subscriptionStatus: true, stripeSubscriptionId: true } }])
  profile!.onboardingCompletedAt = now
  await assert.rejects(page, (error: unknown) => error instanceof Redirect && error.destination === "/dashboard")
  profile!.onboardingCompletedAt = null; profile!.subscriptionStatus = "active"; profile!.stripeSubscriptionId = "sub_paid"
  await assert.rejects(page, (error: unknown) => error instanceof Redirect && error.destination === "/dashboard")
  profile!.stripeSubscriptionId = null
  assert.ok(await page())
  profile!.subscriptionStatus = "paused"; profile!.stripeSubscriptionId = "sub_paused"
  grant = { plan: "business_pro", startsAt: new Date("2026-10-01"), expiresAt: new Date("2026-11-01"), revokedAt: null }
  assert.ok(await page())
  user = null
  await assert.rejects(page, (error: unknown) => error instanceof Redirect && error.destination === "/sign-in")
  assert.equal(writes.length, 0)
})
test("auth callback preserves the exact trialing/incomplete onboarding skip rules", async () => {
  for (const status of ["trialing", "active", "paused", "canceled"]) for (const completed of [false, true]) {
    profile!.subscriptionStatus = status; profile!.onboardingCompletedAt = completed ? now : null
    const response = await callback(new Request("https://paidsoon.test/auth/callback?code=mock"))
    assert.equal(response.headers.get("location"), `https://paidsoon.test${status === "trialing" && !completed ? "/onboarding" : "/dashboard"}`)
  }
  assert.equal(writes.length, 0)
})
test("actual Checkout landing and repeated/cancel-return render display all four intended plans without starting billing or altering access", async () => {
  const noNetwork = mock.method(globalThis, "fetch", async () => { assert.fail("landing must not perform a network request") })
  try {
    const before = access()
    for (const plan of getPublicPlans()) for (const reason of [undefined, "canceled", "trial_expired"]) {
      const rendered = await checkout({ searchParams: Promise.resolve({ plan: plan.id, reason }) })
      const props = billingProps(rendered)
      assert.equal(props?.tier, plan.id); assert.equal(props?.billingAccessVersion, 17); assert.equal(props?.checkoutEnabled, true)
      assert.equal(props?.billingSessionScope, "opaque-session")
      assert.deepEqual(access(), before)
    }
    assert.equal(noNetwork.mock.calls.length, 0); assert.equal(writes.length, 0)
  } finally { noNetwork.mock.restore() }
})