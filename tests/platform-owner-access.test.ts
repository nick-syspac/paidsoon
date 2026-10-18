import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { resolveEffectiveAccess, type EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"
import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { getApplicationAccessPresentation } from "@/lib/subscriptionStatusPresentation"

const now = new Date("2026-10-18T12:00:00Z")
function facts(): EffectiveAccessSnapshot {
  return { profile: { subscriptionStatus: "active", subscriptionTier: "small_business",
    stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 7 }, grant: null,
    billingRisks: [], platformOwnerAccess: true }
}

test("owner fallback eligibility matrix is narrow and ordinary customers remain denied", () => {
  const valid = resolveEffectiveAccess(facts(), now)
  assert.equal(valid.source, "platform_owner")
  assert.equal(valid.effectiveTier, "small_business")
  for (const key of ["effectiveAccessExpiresAt", "effectiveTrialExpiresAt", "effectiveExpirySource", "effectiveExpiryTier", "stripeTrialEndsAt", "restriction"] as const) {
    assert.equal(valid[key], null, key)
  }
  for (const status of ["canceled", "cancelled", "paused", "unpaid", "past_due", "incomplete", "incomplete_expired", "trialing", "unknown", "", null]) {
    const input = facts(); input.profile!.subscriptionStatus = status
    assert.equal(resolveEffectiveAccess(input, now).allowAccess, false, String(status))
  }
  for (const tier of ["unknown", "", null]) {
    const input = facts(); input.profile!.subscriptionTier = tier
    assert.equal(resolveEffectiveAccess(input, now).allowAccess, false)
  }
  for (const platformOwnerAccess of [false, undefined, "true", 1, {}]) {
    const input = { ...facts(), platformOwnerAccess } as EffectiveAccessSnapshot
    assert.equal(resolveEffectiveAccess(input, now).allowAccess, false)
  }
  assert.equal(resolveEffectiveAccess({ ...facts(), profile: null }, now).allowAccess, false)
  for (const risk of [
    { kind: "subscription_invoice", stripeStatus: "open", blocking: true },
    { kind: "subscription_invoice", stripeStatus: "uncollectible", blocking: false },
    { kind: "subscription_dispute", stripeStatus: "lost", blocking: false },
    { kind: "subscription_dispute", stripeStatus: "future", blocking: false },
    { kind: "future", stripeStatus: "paid", blocking: false },
  ]) assert.equal(resolveEffectiveAccess({ ...facts(), billingRisks: [risk] }, now).allowAccess, false)
  for (const tier of [...Object.keys(PLAN_CATALOG), "starter", "solo"]) {
    const input = facts(); input.profile!.subscriptionTier = tier
    assert.equal(resolveEffectiveAccess(input, now).source, "platform_owner", tier)
  }
})

test("real Stripe and valid grant sources precede internal access", () => {
  for (const [status, expected] of [["active", "paid"], ["trialing", "stripe_trial"], ["past_due", "past_due_grace"]]) {
    const input = facts(); input.profile!.stripeSubscriptionId = "sub_real"; input.profile!.subscriptionStatus = status
    assert.equal(resolveEffectiveAccess(input, now).source, expected)
  }
  const input = facts()
  input.grant = { plan: "business_pro", startsAt: new Date(+now - 1000), expiresAt: new Date(+now + 1000), revokedAt: null }
  assert.equal(resolveEffectiveAccess(input, now).source, "admin_grant")
  assert.equal(resolveEffectiveAccess(input, input.grant.expiresAt).source, "platform_owner")
  input.grant.revokedAt = now
  assert.equal(resolveEffectiveAccess(input, now).source, "platform_owner")
})

let role: { role: string; status: string } | null
let unavailable = false
const reads: unknown[] = []
let snapshot = facts()
let readOwner: typeof import("@/lib/billing/platformOwnerAccess").readPlatformOwnerAccess
let readOwners: typeof import("@/lib/billing/platformOwnerAccess").readPlatformOwnerAccessForUsers
let dashboard: typeof import("@/lib/dashboard/loadDashboardProfile").getDashboardProfile
let system: typeof import("@/lib/billing/effectiveAccessSystem")
let billing: typeof import("@/lib/billing")
let getAccess: typeof import("@/lib/billing/effectiveAccessLoader").getEffectiveAccess
const profile = () => ({ ...snapshot.profile!, userId: "target", displayName: "Owner",
  subscriptionStatus: snapshot.profile!.subscriptionStatus ?? "unknown",
  subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null,
  subscriptionCancelAt: null, pendingDowngradeTier: null, createdAt: new Date("2026-01-01Z"), tenantTrialGrant: snapshot.grant })
const tx = {
  userProfile: { findUnique: async () => profile(), findMany: async () => [profile()] },
  tenantTrialGrant: { findUnique: async () => snapshot.grant, findMany: async () => [] },
  tenantBillingRisk: { findMany: async () => snapshot.billingRisks },
  trackedInvoice: { count: async () => 17, findMany: async () => Array.from({ length: 17 }, () => ({ userId: "target", firstChasedAt: now })) },
}
before(async () => {
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    platformRole: {
      findUnique: async (query: unknown) => { reads.push(query); if (unavailable) throw new Error("unavailable"); return role },
      findMany: async (query: unknown) => { reads.push(query); if (unavailable) throw new Error("unavailable"); return role ? [{ userId: "target", ...role }, { userId: "unrequested", ...role }] : [] },
    },
  } } })
  mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async <T>(id: string, fn: (client: typeof tx) => Promise<T>) => { assert.equal(id, "target"); return fn(tx) },
  } })
  ;({ readPlatformOwnerAccess: readOwner, readPlatformOwnerAccessForUsers: readOwners } = await import("@/lib/billing/platformOwnerAccess"))
  ;({ getDashboardProfile: dashboard } = await import("@/lib/dashboard/loadDashboardProfile"))
  ;({ getEffectiveAccess: getAccess } = await import("@/lib/billing/effectiveAccessLoader"))
  system = await import("@/lib/billing/effectiveAccessSystem")
  billing = await import("@/lib/billing")
})
beforeEach(() => { role = { role: "platform_owner", status: "active" }; reads.length = 0; unavailable = false; snapshot = facts() })

test("role lookup is exact, minimal, target-scoped, fresh and fail closed", async () => {
  for (const value of [null, { role: "platform_admin", status: "active" }, { role: "platform_support", status: "active" },
    { role: "platform_owner", status: "disabled" }, { role: "platform_owner", status: "revoked" },
    { role: "platform_owner", status: "unknown" }, { role: "unknown", status: "active" }, { role: "platform_owner", status: "active" }]) {
    role = value
    assert.equal(await readOwner("target"), value?.role === "platform_owner" && value.status === "active")
    assert.deepEqual(reads.at(-1), { where: { userId: "target" }, select: { role: true, status: true } })
  }
  unavailable = true
  assert.equal(await readOwner("target"), false)
  assert.deepEqual(await readOwners(["target"]), new Set())
})

test("batch role fact lookup is one deduplicated requested-ID query with no retained facts", async () => {
  assert.deepEqual(await readOwners([]), new Set())
  assert.equal(reads.length, 0)
  assert.deepEqual(await readOwners(["target", "other", "target"]), new Set(["target"]))
  assert.deepEqual(reads, [{ where: { userId: { in: ["target", "other"] } }, select: { userId: true, role: true, status: true } }])
  role = null
  assert.deepEqual(await readOwners(["target"]), new Set())
  assert.equal(reads.length, 2)
})

test("dashboard/API/system/chase share owner access, safe shapes and unchanged catalog quota", async () => {
  const loaded = await dashboard("target", { now })
  const access = await getAccess("target", { now })
  assert.deepEqual(loaded?.effectiveAccess, access)
  assert.deepEqual(await system.getEffectiveAccessForSystem("target", { now }), access)
  assert.equal(Object.hasOwn(loaded!, "platformOwnerAccess"), false)
  assert.doesNotMatch(JSON.stringify(loaded), /platformRole|"role"|"status":"active"/)
  for (const [tier, limit] of [["essentials", 10], ["business_control", 50], ["small_business", 250], ["business_pro", 1000]] as const) {
    snapshot.profile!.subscriptionTier = tier
    const single = await billing.getChaseAllowanceStatus(tx as never, "target", now)
    const account = await billing.getChaseAllowanceStatusForAccount(tx as never, "target", profile(), now)
    const batch = await billing.getChaseAllowanceStatusesForUsers(tx as never, ["target", "target"], now)
    assert.equal(single?.allowance, limit)
    assert.equal(single?.usage, 17)
    assert.equal(single?.accessAllowed, true)
    assert.deepEqual(single, account)
    assert.deepEqual(single, batch.get("target"))
    assert.equal(await billing.getSubscriptionTier("target", { now }), tier)
  }
  role = { role: "platform_owner", status: "disabled" }
  assert.equal((await dashboard("target", { now }))?.effectiveAccess.allowAccess, false)
  assert.equal((await billing.getChaseAllowanceStatus(tx as never, "target", now))?.allowance, 0)
  assert.equal(await billing.requireFeature("target", "basic_email_reminders", { now }), false)
})

test("system batches use one role query regardless of requested tenant count and deny absent profiles", async () => {
  const ids = ["target", ...Array.from({ length: 100 }, (_, i) => `tenant-${i}`)]
  const batch = await system.getEffectiveAccessForUsersForSystem(ids, { now })
  assert.equal(reads.length, 1)
  assert.equal(batch.get("target")?.source, "platform_owner")
  assert.equal(batch.get("tenant-0")?.restriction, "missing_profile")
  assert.deepEqual(reads[0], { where: { userId: { in: ids } }, select: { userId: true, role: true, status: true } })
})

test("owner presentation is explicit and has no fake dates or purchased-plan claim", () => {
  const access = resolveEffectiveAccess(facts(), now)
  const presentation = getApplicationAccessPresentation(access)
  assert.match(presentation.headline, /Platform owner internal access/)
  assert.match(presentation.description, /not a paid subscription or a trial/)
  assert.equal(presentation.stripeTrial, null)
  assert.equal(presentation.continuity, null)
  assert.equal(presentation.showBanner, true)
})