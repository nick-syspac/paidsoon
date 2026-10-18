import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { EffectiveAccessProfile, TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"
import {
  PLAN_CATALOG,
  UNIMPLEMENTED_FEATURES,
  hasPlanFeature,
  isFeatureImplemented,
  type SubscriptionFeature,
} from "@/lib/subscriptionPlans"

const now = new Date("2026-10-14T12:00:00Z")
const startsAt = new Date("2026-10-01T12:00:00Z")
const expiresAt = new Date("2026-10-15T12:00:00Z")
const profileSelect = {
  subscriptionStatus: true, subscriptionTier: true, stripeSubscriptionId: true,
  trialEndsAt: true, billingAccessVersion: true,
}
const grantSelect = { plan: true, startsAt: true, expiresAt: true, revokedAt: true }
const riskSelect = { kind: true, stripeStatus: true, blocking: true }
type Model = "userProfile" | "tenantTrialGrant" | "tenantBillingRisk"
interface Query {
  where: { userId: string | { in: string[] } }
  select: Record<string, boolean>
}
interface Read { boundary: string; model: Model; method: string; args: Query }

describe("fresh effective-access loaders and billing gates", () => {
  let getEffectiveAccess: typeof import("@/lib/billing/effectiveAccessLoader").getEffectiveAccess
  let getEffectiveAccessForSystem: typeof import("@/lib/billing/effectiveAccessSystem").getEffectiveAccessForSystem
  let getEffectiveAccessForUsersForSystem: typeof import("@/lib/billing/effectiveAccessSystem").getEffectiveAccessForUsersForSystem
  let getSubscriptionTier: typeof import("@/lib/billing").getSubscriptionTier
  let requireFeature: typeof import("@/lib/billing").requireFeature
  let profiles: Map<string, EffectiveAccessProfile>
  let grants: Map<string, TrialGrantSnapshot>
  let risks: Map<string, BillingRiskSnapshot[]>
  let reads: Read[]
  let contexts: string[]
  let systemTransactions: number
  let boundary: string | null
  let failModel: Model | null

  function profile(overrides: Partial<EffectiveAccessProfile> = {}): EffectiveAccessProfile {
    return {
      subscriptionStatus: "canceled", subscriptionTier: "essentials",
      stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 7,
      ...overrides,
    }
  }

  function grant(plan = "small_business"): TrialGrantSnapshot {
    return { plan, startsAt, expiresAt, revokedAt: null }
  }

  function record(model: Model, method: string, args: Query): string[] {
    assert.ok(boundary, "all reads must use the active transaction client")
    reads.push({ boundary, model, method, args })
    const allowed = model === "userProfile" ? profileSelect
      : model === "tenantTrialGrant" ? grantSelect : riskSelect
    const batch = typeof args.where.userId !== "string"
    assert.deepEqual(args.select, batch ? { userId: true, ...allowed } : allowed)
    if (failModel === model) throw new Error("mock read unavailable")
    const ids = typeof args.where.userId === "string" ? [args.where.userId] : args.where.userId.in
    if (boundary.startsWith("user:")) {
      assert.deepEqual(ids, [boundary.slice(5)], "explicit tenant scopes must match the RLS context")
    }
    return ids
  }

  // A global client has no model delegates: reads outside the transaction fail.
  const tx = {
    userProfile: {
      findUnique: async (args: Query) => profiles.get(record("userProfile", "findUnique", args)[0]) ?? null,
      findMany: async (args: Query) => record("userProfile", "findMany", args).flatMap((userId) => {
        const value = profiles.get(userId)
        return value ? [{ userId, ...value }] : []
      }),
    },
    tenantTrialGrant: {
      findUnique: async (args: Query) => grants.get(record("tenantTrialGrant", "findUnique", args)[0]) ?? null,
      findMany: async (args: Query) => record("tenantTrialGrant", "findMany", args).flatMap((userId) => {
        const value = grants.get(userId)
        return value ? [{ userId, ...value }] : []
      }),
    },
    tenantBillingRisk: {
      findMany: async (args: Query) => {
        const ids = record("tenantBillingRisk", "findMany", args)
        return typeof args.where.userId === "string" ? risks.get(ids[0]) ?? []
          : ids.flatMap((userId) => (risks.get(userId) ?? []).map((value) => ({ userId, ...value })))
      },
    },
  }

  async function transaction<T>(scope: string, fn: (client: typeof tx) => Promise<T>): Promise<T> {
    assert.equal(boundary, null)
    boundary = scope
    try { return await fn(tx) } finally { boundary = null }
  }

  before(async () => {
    await mock.module("server-only", { namedExports: {} })
    await mock.module("@/lib/db/withUserContext", {
      namedExports: { withUserContext: async <T>(userId: string, fn: (client: typeof tx) => Promise<T>) => {
        contexts.push(userId)
        return transaction(`user:${userId}`, fn)
      } },
    })
    await mock.module("@/lib/db/admin", {
      namedExports: { prismaAdmin: { $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => {
        systemTransactions++
        return transaction("system", fn)
      } } },
    })
    ;({ getEffectiveAccess } = await import("@/lib/billing/effectiveAccessLoader"))
    ;({ getEffectiveAccessForSystem, getEffectiveAccessForUsersForSystem } = await import("@/lib/billing/effectiveAccessSystem"))
    ;({ getSubscriptionTier, requireFeature } = await import("@/lib/billing"))
  })

  beforeEach(() => {
    profiles = new Map([["tenant-a", profile()], ["tenant-b", profile()]])
    grants = new Map([["tenant-a", grant()], ["tenant-b", grant("business_pro")]])
    risks = new Map()
    reads = []; contexts = []; systemTransactions = 0; boundary = null; failModel = null
  })

  test("customer loader combines profile/grant/risk reads in one tenant-scoped RLS transaction with safe selects", async () => {
    const access = await getEffectiveAccess("tenant-a", { now })
    assert.equal(access.source, "admin_grant")
    assert.equal(access.effectiveTier, "small_business")
    assert.equal(access.version, 7)
    assert.deepEqual(contexts, ["tenant-a"])
    assert.equal(systemTransactions, 0)
    assert.deepEqual(reads.map((read) => read.boundary), Array(3).fill("user:tenant-a"))
    assert.deepEqual(reads.map((read) => read.args.where), Array(3).fill({ userId: "tenant-a" }))
    assert.equal(JSON.stringify(access).includes("stripeSubscriptionId"), false)
  })

  test("another tenant's grant or risk cannot supply or suppress the requested tenant's access", async () => {
    grants.delete("tenant-a")
    risks.set("tenant-b", [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }])
    const denied = await getEffectiveAccess("tenant-a", { now })
    assert.equal(denied.allowAccess, false)
    assert.equal(denied.effectiveTier, null)
    assert.equal(denied.grant, null)
    grants.set("tenant-a", grant())
    assert.equal((await getEffectiveAccess("tenant-a", { now })).allowAccess, true)
  })

  test("reads are fresh across calls, revocation and exclusive expiry are immediate", async () => {
    assert.equal((await getEffectiveAccess("tenant-a", { now })).allowAccess, true)
    assert.equal((await getEffectiveAccess("tenant-a", { now: expiresAt })).allowAccess, false)
    grants.set("tenant-a", { ...grant(), revokedAt: now })
    assert.equal((await getEffectiveAccess("tenant-a", { now })).allowAccess, false)
    assert.equal(reads.length, 9)
    assert.equal(contexts.length, 3)
  })

  test("known blocking and unknown nonblocking risk facts are loaded and suppress grants", async () => {
    for (const risk of [
      { kind: "subscription_invoice", stripeStatus: "open", blocking: true },
      { kind: "subscription_dispute", stripeStatus: "future_status", blocking: false },
    ]) {
      risks.set("tenant-a", [risk])
      const access = await getEffectiveAccess("tenant-a", { now })
      assert.equal(access.allowAccess, false)
      assert.equal(access.showBillingWarning, true)
    }
  })

  test("privileged single loader uses one explicitly scoped transaction and matches customer resolution", async () => {
    const customer = await getEffectiveAccess("tenant-a", { now })
    const system = await getEffectiveAccessForSystem("tenant-a", { now })
    assert.deepEqual(system, customer)
    assert.equal(systemTransactions, 1)
    assert.deepEqual(reads.slice(3).map((read) => read.boundary), Array(3).fill("system"))
    assert.deepEqual(reads.slice(3).map((read) => read.args.where), Array(3).fill({ userId: "tenant-a" }))
  })

  test("system batch performs three scoped queries, deduplicates IDs, isolates risks and denies missing profiles", async () => {
    profiles.set("tenant-b", profile({ subscriptionStatus: "active", stripeSubscriptionId: "sub-b", subscriptionTier: "business_control" }))
    risks.set("tenant-a", [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }])
    grants.set("missing", grant("business_pro"))
    const result = await getEffectiveAccessForUsersForSystem(["tenant-a", "tenant-b", "missing", "tenant-a"], { now })
    assert.equal(result.size, 3)
    assert.equal(result.get("tenant-a")?.allowAccess, false)
    assert.equal(result.get("tenant-b")?.effectiveTier, "business_control")
    assert.equal(result.get("missing")?.restriction, "missing_profile")
    assert.equal(result.get("missing")?.effectiveTier, null)
    assert.equal(systemTransactions, 1)
    assert.equal(reads.length, 3)
    for (const read of reads) {
      assert.equal(read.method, "findMany")
      assert.equal(read.boundary, "system")
      assert.deepEqual(read.args.where, { userId: { in: ["tenant-a", "tenant-b", "missing"] } })
    }
    for (const id of result.keys()) {
      assert.deepEqual(result.get(id), await getEffectiveAccessForSystem(id, { now }))
    }
  })

  test("batch does not query for empty input and never retains a previous result", async () => {
    assert.deepEqual(await getEffectiveAccessForUsersForSystem([], { now }), new Map())
    assert.equal(systemTransactions, 0)
    assert.equal(reads.length, 0)
    assert.equal((await getEffectiveAccessForUsersForSystem(["tenant-a"], { now })).get("tenant-a")?.allowAccess, true)
    grants.delete("tenant-a")
    assert.equal((await getEffectiveAccessForUsersForSystem(["tenant-a"], { now })).get("tenant-a")?.allowAccess, false)
    assert.equal(systemTransactions, 2)
    assert.equal(reads.length, 6)
  })

  test("default server clock is fresh after reads, not a module-level captured instant", async (context) => {
    context.mock.timers.enable({ apis: ["Date"], now })
    profiles.set("tenant-a", profile({ subscriptionStatus: "trialing", stripeSubscriptionId: "sub-a", trialEndsAt: startsAt }))
    grants.delete("tenant-a")
    context.mock.method(tx.tenantBillingRisk, "findMany", async (args: Query) => {
      record("tenantBillingRisk", "findMany", args)
      context.mock.timers.setTime(expiresAt.getTime())
      return []
    })
    const access = await getEffectiveAccess("tenant-a")
    assert.equal(access.trialTimingPendingReconciliation, true)
    assert.deepEqual(access.effectiveTrialExpiresAt, expiresAt)
    context.mock.timers.setTime(now.getTime())
    assert.deepEqual((await getEffectiveAccessForSystem("tenant-a")).effectiveTrialExpiresAt, expiresAt)
    context.mock.timers.setTime(now.getTime())
    assert.deepEqual((await getEffectiveAccessForUsersForSystem(["tenant-a"])).get("tenant-a")?.effectiveTrialExpiresAt, expiresAt)
  })

  test("invalid explicit now and unavailable reads never return authorization defaults", async () => {
    await assert.rejects(getEffectiveAccess("tenant-a", { now: new Date(NaN) }), RangeError)
    for (const model of ["userProfile", "tenantTrialGrant", "tenantBillingRisk"] as const) {
      failModel = model
      await assert.rejects(requireFeature("tenant-a", "basic_email_reminders", { now }), /mock read unavailable/)
      await assert.rejects(getEffectiveAccessForUsersForSystem(["tenant-a"], { now }), /mock read unavailable/)
    }
  })

  test("billing returns null and false rather than Essentials on missing, expired, unknown or restricted access", async () => {
    grants.clear()
    for (const value of [
      null,
      profile({ subscriptionStatus: "trialing", trialEndsAt: now }),
      profile({ subscriptionStatus: "active" }),
      profile({ subscriptionStatus: "unexpected" }),
      profile({ subscriptionStatus: "active", stripeSubscriptionId: "sub-a", subscriptionTier: "unknown" }),
      profile({ subscriptionStatus: "unpaid", stripeSubscriptionId: "sub-a" }),
    ]) {
      if (value) profiles.set("tenant-a", value)
      else profiles.delete("tenant-a")
      assert.equal(await getSubscriptionTier("tenant-a", { now }), null)
      assert.equal(await requireFeature("tenant-a", "basic_email_reminders", { now }), false)
    }
  })

  test("tier-only mock data is not proof of authorized status", async () => {
    profiles.set("tenant-a", { subscriptionTier: "business_pro" } as EffectiveAccessProfile)
    assert.equal(await getSubscriptionTier("tenant-a", { now }), null)
    assert.equal(await requireFeature("tenant-a", "basic_email_reminders", { now }), false)
  })

  test("all four grant plans use unchanged catalog features and readiness flags", async () => {
    const catalogBefore = JSON.stringify(PLAN_CATALOG)
    const readinessBefore = UNIMPLEMENTED_FEATURES.map(isFeatureImplemented)
    for (const tier of ["essentials", "business_control", "small_business", "business_pro"] as const) {
      grants.set("tenant-a", grant(tier))
      assert.equal(await getSubscriptionTier("tenant-a", { now }), tier)
      for (const feature of Object.keys(PLAN_CATALOG[tier].features) as SubscriptionFeature[]) {
        assert.equal(await requireFeature("tenant-a", feature, { now }), hasPlanFeature(tier, feature), `${tier}:${feature}`)
      }
    }
    assert.equal(JSON.stringify(PLAN_CATALOG), catalogBefore)
    assert.deepEqual(UNIMPLEMENTED_FEATURES.map(isFeatureImplemented), readinessBefore)
  })

  test("paid, Stripe trial and past-due grace preserve their billing tier rather than the retained grant plan", async () => {
    for (const subscriptionStatus of ["active", "trialing", "past_due"]) {
      profiles.set("tenant-a", profile({ subscriptionStatus, subscriptionTier: "business_control", stripeSubscriptionId: "sub-a" }))
      assert.equal(await getSubscriptionTier("tenant-a", { now }), "business_control")
      assert.equal(await requireFeature("tenant-a", "verified_from_domain", { now }), false)
      assert.equal(await requireFeature("tenant-a", "custom_reply_to", { now }), true)
    }
  })
})