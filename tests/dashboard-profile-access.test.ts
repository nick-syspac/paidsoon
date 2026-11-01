import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import type { DashboardProfileFacts } from "@/lib/dashboard/loadDashboardProfile"
import type { TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"
import { EFFECTIVE_ACCESS_GRANT_SELECT, EFFECTIVE_ACCESS_RISK_SELECT } from "@/lib/billing/effectiveAccessSnapshot"

const now = new Date("2026-10-16T12:00:00Z")
let profile: DashboardProfileFacts | null
let grant: TrialGrantSnapshot | null
let risks: BillingRiskSnapshot[]
let accountDisplaySetting: { displayFromDate: Date | null; revision: number; timeZone: string } | null
const calls: { table: string; query: unknown; userId: string }[] = []
let afterRead: (() => void) | null = null
let load: typeof import("@/lib/dashboard/loadDashboardProfile").getDashboardProfile
let select: typeof import("@/lib/dashboard/loadDashboardProfile").DASHBOARD_PROFILE_SELECT

before(async () => {
  await mock.module("server-only", { namedExports: {} })
  await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    platformRole: { findUnique: async () => null },
  } } })
  await mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async (userId: string, callback: (tx: unknown) => Promise<unknown>) => callback({
      userProfile: { findUnique: async (query: unknown) => { calls.push({ table: "profile", query, userId }); return profile } },
      accountDisplaySetting: { findUnique: async (query: unknown) => {
        calls.push({ table: "account_display_setting", query, userId })
        return accountDisplaySetting
      } },
      tenantTrialGrant: { findUnique: async (query: unknown) => { calls.push({ table: "grant", query, userId }); return grant } },
      tenantBillingRisk: { findMany: async (query: unknown) => {
        calls.push({ table: "risks", query, userId }); afterRead?.(); return risks
      } },
    }),
  } })
  const loaded = await import("@/lib/dashboard/loadDashboardProfile")
  load = loaded.getDashboardProfile
  select = loaded.DASHBOARD_PROFILE_SELECT
})

beforeEach(() => {
  calls.length = 0
  afterRead = null
  profile = {
    subscriptionTier: "essentials", subscriptionStatus: "canceled", stripeSubscriptionId: "sub_private",
    trialEndsAt: null, billingAccessVersion: 17, displayName: "Tenant", createdAt: new Date("2026-01-01Z"),
    subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAt: null, pendingDowngradeTier: null,
  }
  grant = { plan: "business_pro", startsAt: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 1000), revokedAt: null }
  risks = []
  accountDisplaySetting = null
})

test("profile uses explicit safe column selections and tenant context for every access fact", async () => {
  const result = await load("tenant-a", { now })
  assert.equal(result?.subscriptionTier, "essentials")
  assert.equal(result?.effectiveAccess.effectiveTier, "business_pro")
  assert.deepEqual(calls, [
    { table: "profile", userId: "tenant-a", query: { where: { userId: "tenant-a" }, select } },
    { table: "account_display_setting", userId: "tenant-a", query: { where: { userId: "tenant-a" }, select: { displayFromDate: true, revision: true, timeZone: true } } },
    { table: "grant", userId: "tenant-a", query: { where: { userId: "tenant-a" }, select: EFFECTIVE_ACCESS_GRANT_SELECT } },
    { table: "risks", userId: "tenant-a", query: { where: { userId: "tenant-a" }, select: EFFECTIVE_ACCESS_RISK_SELECT } },
  ])
  assert.doesNotMatch(JSON.stringify(select), /stripeCustomer|pendingTrialOperation|pendingBillingMutation|userId|reason/)
  assert.equal(Object.hasOwn(result!, "billingRisks"), false)
})

test("repeated reads cross exact expiry and revocation without reusing cached authorization", async () => {
  assert.equal((await load("tenant-a", { now }))?.effectiveAccess.allowAccess, true)
  assert.equal((await load("tenant-a", { now: grant!.expiresAt }))?.effectiveAccess.allowAccess, false)
  grant!.revokedAt = now
  assert.equal((await load("tenant-a", { now }))?.effectiveAccess.effectiveTier, null)
  assert.equal(calls.length, 12)
  await load("tenant-b", { now })
  assert.ok(calls.slice(-4).every((call) => call.userId === "tenant-b"))
})

test("canonical account display settings override legacy profile columns", async () => {
  profile = {
    ...profile!,
    accountDisplayFromDate: new Date("2026-09-01T00:00:00.000Z"),
    accountDisplayRevision: 1,
    accountDisplayTimeZone: "Australia/Melbourne",
  }
  accountDisplaySetting = {
    displayFromDate: new Date("2026-10-01T00:00:00.000Z"),
    revision: 7,
    timeZone: "Australia/Melbourne",
  }

  const result = await load("tenant-a", { now })
  assert.equal(result?.accountDisplayFromDate?.toISOString(), "2026-10-01T00:00:00.000Z")
  assert.equal(result?.accountDisplayRevision, 7)
  assert.equal(result?.accountDisplayTimeZone, "Australia/Melbourne")
})

test("all risk facts including unknown nonblocking states suppress grants", async () => {
  risks = [{ kind: "subscription_dispute", stripeStatus: "future-status", blocking: false }]
  assert.equal((await load("tenant-a", { now }))?.effectiveAccess.restriction, "unknown_billing_risk")
  risks = [{ kind: "subscription_invoice", stripeStatus: "uncollectible", blocking: true }]
  assert.equal((await load("tenant-a", { now }))?.effectiveAccess.allowAccess, false)
})

test("default evaluation time is after reads rather than before slow loading", async () => {
  afterRead = () => { grant!.expiresAt = new Date(0) }
  assert.equal((await load("tenant-a"))?.effectiveAccess.allowAccess, false)
})

test("missing profile stays nullable and does not invent entitlement or read journals", async () => {
  profile = null
  assert.equal(await load("tenant-a", { now }), null)
  assert.equal(calls.length, 1)
})