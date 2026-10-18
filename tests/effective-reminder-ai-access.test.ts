import { after, before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { Resend } from "resend"
import type { EffectiveAccessProfile, TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"
import type { TrackedInvoiceWithCanonical } from "@/lib/invoices/canonical"
import { hasPlanFeature, isFeatureImplemented, UNIMPLEMENTED_FEATURES } from "@/lib/subscriptionPlans"

const now = new Date("2026-10-17T12:00:00Z")
const end = new Date("2026-10-20T12:00:00Z")
const plans = ["essentials", "business_control", "small_business", "business_pro"] as const
type Profile = EffectiveAccessProfile & {
  createdAt: Date
  subscriptionCurrentPeriodStart: Date | null
  subscriptionCurrentPeriodEnd: Date | null
}
type Query = { where: { userId: string }; select?: Record<string, boolean> }
type UsageQuery = { where: { userId: string; feature: string; createdAt: { gte: Date; lt?: Date } } }
let profile: Profile | null
let ownerRoleActive = false
let grant: TrialGrantSnapshot | null
let risks: BillingRiskSnapshot[]
let verified = true
let afterPreparation: (() => void) | undefined
let afterSettingsRead: (() => void) | undefined
let afterQuotaRead: (() => void) | undefined
let afterModelStarted: (() => void) | undefined
let afterAccessRead: (() => void) | undefined
let rewriteCalls: number
let aiLogWrites: Array<Record<string, unknown>>
let providerCalls: Array<Record<string, unknown>>
let logWrites: unknown[]
let tokenWrites: number
let quotaReads: UsageQuery[]
let usageRows: Array<{ userId: string; feature: string; createdAt: Date }>
let domainCalls: number
let settingsWrites: number
let rlsContexts: string[]
let send: typeof import("@/lib/email/send")
let ai: typeof import("@/lib/email/ai-usage-guardrails")
let emailRoute: typeof import("@/app/api/settings/email/route")
let aiRoute: typeof import("@/app/api/settings/ai/route")

function scoped(query: Query): void { assert.equal(query.where.userId, "tenant-a") }
const tx = {
  userProfile: { findUnique: async (query: Query) => { scoped(query); afterAccessRead?.(); return profile } },
  tenantTrialGrant: { findUnique: async (query: Query) => { scoped(query); return grant } },
  tenantBillingRisk: { findMany: async (query: Query) => { scoped(query); return risks } },
  emailSettings: {
    findUnique: async (query: Query) => {
      scoped(query)
      afterSettingsRead?.()
      return { fromEmail: "accounts@customer.com.au", fromName: "Customer", replyTo: "reply@customer.com.au", resendVerified: verified }
    },
    upsert: async () => { settingsWrites++; return {} },
    update: async () => { settingsWrites++; return {} },
  },
  emailTemplate: { findUnique: async () => { afterPreparation?.(); return null } },
  trackedInvoice: { update: async () => { tokenWrites++; return {} } },
  emailLog: {
    findFirst: async () => null,
    create: async (args: unknown) => { logWrites.push(args); return {} },
  },
  aiUsageLog: {
    count: async (query: UsageQuery) => {
      scoped(query)
      quotaReads.push(query)
      afterQuotaRead?.()
      const { userId, feature, createdAt: { gte, lt } } = query.where
      return usageRows.filter(row => row.userId === userId && row.feature === feature &&
        row.createdAt >= gte && (!lt || row.createdAt < lt)).length
    },
  },
}

before(async () => {
  mock.timers.enable({ apis: ["Date"], now })
  process.env.RESEND_API_KEY = "test-only-no-network"
  process.env.RESEND_FROM_EMAIL = "system@paidsoon.com.au"
  process.env.RESEND_FROM_NAME = "PaidSoon"
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    platformRole: { findUnique: async (query: Query) => {
      scoped(query)
      assert.deepEqual(query.select, { role: true, status: true })
      return { role: "platform_owner", status: ownerRoleActive ? "active" : "disabled" }
    } },
    ...tx, $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
    aiUsageLog: { ...tx.aiUsageLog, create: async ({ data }: { data: Record<string, unknown> }) => {
      aiLogWrites.push(data)
      usageRows.push({ userId: String(data.userId), feature: String(data.feature), createdAt: new Date() })
      return {}
    } },
  } } })
  mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async <T>(userId: string, fn: (client: typeof tx) => Promise<T>) => {
      assert.equal(userId, "tenant-a"); rlsContexts.push(userId); return fn(tx)
    },
  } })
  mock.module("@/lib/supabase/server", { namedExports: {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "tenant-a" } } }) } }),
  } })
  mock.module("@/lib/email/ai-rewrite", { namedExports: {
    AI_REWRITE_MODEL: "gpt-4o-mini", INPUT_COST_PER_TOKEN_USD: 0.15 / 1_000_000,
    OUTPUT_COST_PER_TOKEN_USD: 0.6 / 1_000_000,
    rewriteMessage: async () => {
      rewriteCalls++; afterModelStarted?.()
      const variant = { subject: "Reminder", message: "Please pay." }
      return { output: { friendly: variant, firm: variant, final_notice: variant },
        usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 } }
    },
  } })
  // Stub SDK prototypes so even transitive imports use a fake transport. Fail
  // closed if any code unexpectedly attempts real network access.
  // tsx may load the CJS export transitively while this test imports ESM.
  const cjs = createRequire(import.meta.url)("resend") as typeof import("resend")
  for (const Client of new Set([Resend, cjs.Resend])) {
    const sdk = new Client("test-only-no-network")
    mock.method(Object.getPrototypeOf(sdk.emails), "send", async (payload: Record<string, unknown>) => {
      providerCalls.push(payload); return { data: { id: "fake-message" }, error: null }
    })
    mock.method(Object.getPrototypeOf(sdk.domains), "list", async () => {
      domainCalls++; return { data: { data: [{ name: "customer.com.au", status: "verified" }] } }
    })
    mock.method(Object.getPrototypeOf(sdk.domains), "create", async () => { domainCalls++; return {} })
  }
  mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network access") })
  send = await import("@/lib/email/send")
  ai = await import("@/lib/email/ai-usage-guardrails")
  emailRoute = await import("@/app/api/settings/email/route")
  aiRoute = await import("@/app/api/settings/ai/route")
})
after(() => { mock.timers.reset(); mock.restoreAll() })
beforeEach(() => {
  ownerRoleActive = false
  mock.timers.setTime(now.getTime())
  profile = {
    subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null,
    trialEndsAt: null, billingAccessVersion: 1, createdAt: new Date("2026-01-01T00:00:00Z"),
    subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null,
  }
  grant = { plan: "small_business", startsAt: new Date("2026-10-10T00:00:00Z"), expiresAt: end, revokedAt: null }
  risks = []; verified = true; afterPreparation = undefined; afterSettingsRead = undefined
  afterQuotaRead = undefined; afterModelStarted = undefined; afterAccessRead = undefined; rewriteCalls = 0; aiLogWrites = []
  providerCalls = []; logWrites = []; tokenWrites = 0; quotaReads = []; usageRows = []
  domainCalls = 0; settingsWrites = 0; rlsContexts = []
})

function invoice(email = "debtor@customer.com.au"): TrackedInvoiceWithCanonical {
  return {
    id: "invoice-a", userId: "tenant-a", p2pToken: "existing-token",
    financialInvoice: {
      id: "financial-a", amountDueCents: 5000, currency: "aud", dueDate: new Date("2026-10-01T00:00:00Z"),
      paymentUrl: null, contact: { email, name: "Client" },
    },
  } as unknown as TrackedInvoiceWithCanonical
}
function sendReminder(email?: string) { return send.sendFollowUpEmail(invoice(email), 2, "owner@customer.com.au", "Owner") }

test("internal owner inherits reminder sender and AI limits, with fresh revocation before send", async () => {
  profile!.subscriptionStatus = "active"
  profile!.subscriptionTier = "small_business"
  grant = null
  ownerRoleActive = true
  const quota = await ai.getAiRewriteGuardrailStatus("tenant-a", now)
  assert.equal(quota?.monthlyQuota, 500)
  assert.equal(quota?.allowed, true)
  assert.equal(await sendReminder(), "fake-message")
  assert.equal(providerCalls[0].from, "Customer <accounts@customer.com.au>")
  assert.equal(logWrites.length, 1)
  afterPreparation = () => { ownerRoleActive = false }
  assert.deepEqual(await sendReminder(), { outcome: "skipped", reason: "access_denied" })
  assert.equal(providerCalls.length, 1)
  assert.equal(logWrites.length, 1)
  assert.equal(await ai.getAiRewriteGuardrailStatus("tenant-a", now), null)
})

describe("financial promise notification execution", () => {
  function notify() {
    return send.sendP2PNotification("promise_broken", invoice(), {
      promisedPayBy: now, promisedAmount: 5000,
    } as never, "owner@customer.com.au", "Owner", 1)
  }
  test("a valid grant dispatches the known promise notification", async () => {
    assert.deepEqual(await notify(), { status: "sent" })
    assert.equal(providerCalls.length, 1)
  })
  for (const state of ["expired", "revoked", "restricted", "expired_before_dispatch"] as const) {
    test(`${state} grant sends no promise notification`, async () => {
      if (state === "expired") mock.timers.setTime(end.getTime())
      if (state === "revoked") grant!.revokedAt = now
      if (state === "restricted") risks = [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }]
      if (state === "expired_before_dispatch") {
        let reads = 0
        afterAccessRead = () => { if (++reads === 2) mock.timers.setTime(end.getTime()) }
      }
      assert.deepEqual(await notify(), { status: "skipped", reason: "no_access" })
      assert.equal(providerCalls.length, 0)
    })
  }
})

describe("effective reminder sender identity and dispatch", () => {
  for (const plan of plans) {
    test(`${plan} grant uses catalog sender identity, not inactive billing tier`, async () => {
      grant!.plan = plan
      assert.equal(await sendReminder(), "fake-message")
      assert.equal(providerCalls.length, 1)
      const customName = hasPlanFeature(plan, "custom_sender_name")
      const customDomain = hasPlanFeature(plan, "verified_from_domain")
      assert.equal(providerCalls[0].from, customDomain ? "Customer <accounts@customer.com.au>"
        : `${customName ? "Customer" : "PaidSoon"} <system@paidsoon.com.au>`)
      assert.equal(providerCalls[0].replyTo, hasPlanFeature(plan, "custom_reply_to") ? "reply@customer.com.au" : undefined)
      assert.equal(logWrites.length, 1)
    })
  }
  test("Small Business still needs Resend verification for a custom domain", async () => {
    verified = false
    assert.equal(await sendReminder(), "fake-message")
    assert.equal(providerCalls[0].from, "Customer <system@paidsoon.com.au>")
    assert.equal(providerCalls[0].replyTo, "reply@customer.com.au")
  })
  for (const change of ["expiry", "revoke", "risk"] as const) {
    test(`${change} during template preparation denies before send or success logging`, async () => {
      afterPreparation = () => {
        if (change === "expiry") mock.timers.setTime(end.getTime())
        if (change === "revoke") grant!.revokedAt = now
        if (change === "risk") risks = [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }]
      }
      assert.deepEqual(await sendReminder(), { outcome: "skipped", reason: "access_denied" })
      assert.equal(providerCalls.length, 0)
      assert.equal(logWrites.length, 0)
    })
  }
  test("expiry during sender settings read is caught by the final access read", async () => {
    afterSettingsRead = () => mock.timers.setTime(end.getTime())
    assert.deepEqual(await sendReminder(), { outcome: "skipped", reason: "access_denied" })
    assert.equal(providerCalls.length, 0)
    assert.equal(logWrites.length, 0)
  })
  test("expired queued reminder, including reserved recipient, never logs success or creates a token", async () => {
    mock.timers.setTime(end.getTime())
    assert.deepEqual(await sendReminder("client@example.test"), { outcome: "skipped", reason: "access_denied" })
    assert.equal(await send.resolveFromAddress("tenant-a"), null)
    assert.equal(providerCalls.length, 0)
    assert.equal(logWrites.length, 0)
    assert.equal(tokenWrites, 0)
  })
  test("a plan change during preparation uses the new sender feature ladder", async () => {
    afterPreparation = () => { grant!.plan = "essentials" }
    assert.equal(await sendReminder(), "fake-message")
    assert.equal(providerCalls[0].from, "PaidSoon <system@paidsoon.com.au>")
    assert.equal(providerCalls[0].replyTo, undefined)
  })
  test("independent paid access survives grant revocation using its paid sender plan", async () => {
    profile!.subscriptionStatus = "active"; profile!.stripeSubscriptionId = "sub_paid"
    profile!.subscriptionTier = "business_control"; grant!.revokedAt = now
    assert.equal(await sendReminder(), "fake-message")
    assert.equal(providerCalls[0].from, "Customer <system@paidsoon.com.au>")
  })
})

describe("effective AI quota with unchanged successful usage and cadence", () => {
  for (const [index, plan] of plans.entries()) {
    test(`${plan} grant applies its existing AI quota/readiness`, async () => {
      grant!.plan = plan
      const result = await ai.getAiRewriteGuardrailStatus("tenant-a", now)
      if (plan === "essentials") {
        assert.equal(result, null); assert.equal(quotaReads.length, 0)
      } else {
        assert.equal(result?.monthlyQuota, [0, 120, 500, 1000][index])
        assert.equal(result?.allowed, true)
        assert.equal(quotaReads.length, 3)
        assert.equal(isFeatureImplemented("ai_rewrite"), true)
      }
      assert.ok(rlsContexts.every(id => id === "tenant-a"))
      for (const feature of UNIMPLEMENTED_FEATURES) assert.equal(isFeatureImplemented(feature), false)
    })
  }
  for (const denied of ["expired", "revoked", "missing", "unknown", "risk"] as const) {
    test(`${denied} access returns null before quota reads`, async () => {
      if (denied === "expired") grant!.expiresAt = now
      if (denied === "revoked") grant!.revokedAt = now
      if (denied === "missing") profile = null
      if (denied === "unknown") profile!.subscriptionStatus = "unknown"
      if (denied === "risk") risks = [{ kind: "subscription_invoice", stripeStatus: "uncollectible", blocking: true }]
      assert.equal(await ai.getAiRewriteGuardrailStatus("tenant-a", now), null)
      assert.equal(quotaReads.length, 0)
    })
  }
  test("extension, plan and source changes retain actual monthly/hourly/burst counts and timestamps", async () => {
    usageRows = [
      { userId: "tenant-a", feature: "ai_rewrite", createdAt: new Date("2026-10-02T00:00:00Z") },
      { userId: "tenant-a", feature: "ai_rewrite", createdAt: new Date("2026-10-17T11:30:00Z") },
      { userId: "tenant-a", feature: "ai_rewrite", createdAt: new Date("2026-10-17T11:59:30Z") },
      { userId: "tenant-b", feature: "ai_rewrite", createdAt: now },
      { userId: "tenant-a", feature: "other", createdAt: now },
    ]
    const original = structuredClone(usageRows)
    const initial = await ai.getAiRewriteGuardrailStatus("tenant-a", now)
    assert.deepEqual(initial?.usage, { monthly: 3, hourly: 2, burst: 1 })
    assert.deepEqual(initial?.period, {
      start: new Date("2026-09-30T14:00:00Z"), end: new Date("2026-10-31T13:00:00Z"),
    })
    grant!.expiresAt = new Date("2026-12-01T00:00:00Z")
    grant!.plan = "business_pro"
    const extended = await ai.getAiRewriteGuardrailStatus("tenant-a", now)
    assert.deepEqual(extended?.period, initial?.period)
    assert.deepEqual(extended?.usage, initial?.usage)
    assert.equal(extended?.remainingMonthlyCredits, 997)
    profile!.subscriptionStatus = "active"; profile!.stripeSubscriptionId = "sub_paid"
    profile!.subscriptionTier = "business_control"
    const paid = await ai.getAiRewriteGuardrailStatus("tenant-a", now)
    assert.deepEqual(paid?.period, initial?.period)
    assert.deepEqual(paid?.usage, initial?.usage)
    assert.equal(paid?.remainingMonthlyCredits, 117)
    assert.deepEqual(usageRows, original)
  })
  test("new effective lower plan enforces its quota against pre-existing actual usage", async () => {
    usageRows = Array.from({ length: 120 }, () => ({
      userId: "tenant-a", feature: "ai_rewrite", createdAt: new Date("2026-10-02T00:00:00Z"),
    }))
    grant!.plan = "business_pro"
    assert.equal((await ai.getAiRewriteGuardrailStatus("tenant-a", now))?.allowed, true)
    grant!.plan = "business_control"
    const limited = await ai.getAiRewriteGuardrailStatus("tenant-a", now)
    assert.equal(limited?.allowed, false); assert.equal(limited?.reason, "monthly")
    assert.equal(limited?.remainingMonthlyCredits, 0); assert.equal(usageRows.length, 120)
  })
  test("existing billing-period and onboarding-trial accounting windows remain unchanged", async () => {
    profile!.subscriptionCurrentPeriodStart = new Date("2026-10-05T00:00:00Z")
    profile!.subscriptionCurrentPeriodEnd = new Date("2026-11-05T00:00:00Z")
    assert.deepEqual((await ai.getAiRewriteGuardrailStatus("tenant-a", now))?.period, {
      start: profile!.subscriptionCurrentPeriodStart, end: profile!.subscriptionCurrentPeriodEnd,
    })
    profile!.subscriptionCurrentPeriodStart = null; profile!.subscriptionCurrentPeriodEnd = null
    profile!.subscriptionStatus = "trialing"; profile!.trialEndsAt = end
    const period = (await ai.getAiRewriteGuardrailStatus("tenant-a", now))?.period
    assert.deepEqual(period, { start: profile!.createdAt, end })
    grant!.expiresAt = new Date("2026-12-01T00:00:00Z")
    assert.deepEqual((await ai.getAiRewriteGuardrailStatus("tenant-a", now))?.period, period)
  })
})

describe("effective sender settings provider features", () => {
  for (const plan of plans) {
    test(`${plan} verification polling retains the verified-domain feature gate`, async () => {
      grant!.plan = plan; verified = false
      const response = await emailRoute.GET()
      assert.equal(response.status, 200)
      assert.equal(domainCalls, hasPlanFeature(plan, "verified_from_domain") ? 1 : 0)
      assert.equal(settingsWrites, domainCalls)
    })
    test(`${plan} sender update retains the custom-reply-to and domain-registration gates`, async () => {
      grant!.plan = plan
      const response = await emailRoute.PUT(new Request("https://app.paidsoon.com.au/api/settings/email", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromEmail: "new@new-domain.com.au", fromName: "New", replyTo: "reply@customer.com.au" }),
      }))
      assert.equal(response.status, hasPlanFeature(plan, "custom_reply_to") ? 200 : 403)
      assert.equal(domainCalls, hasPlanFeature(plan, "verified_from_domain") ? 1 : 0)
    })
  }
  test("expiry after settings preparation prevents verification provider call", async () => {
    verified = false
    afterSettingsRead = () => mock.timers.setTime(end.getTime())
    assert.equal((await emailRoute.GET()).status, 200)
    assert.equal(domainCalls, 0); assert.equal(settingsWrites, 0)
  })
})

function rewriteRequest(): Request {
  return new Request("https://app.paidsoon.com.au/api/settings/ai", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Please pay the outstanding invoice.", stage: 2 }),
  })
}
describe("actual AI route with effective grant quota and successful usage", () => {
  for (const plan of plans) {
    test(`${plan} authorizes generation and accounts for actual success only when entitled`, async () => {
      grant!.plan = plan
      const response = await aiRoute.POST(rewriteRequest())
      assert.equal(response.status, plan === "essentials" ? 403 : 200)
      assert.equal(rewriteCalls, plan === "essentials" ? 0 : 1)
      assert.equal(aiLogWrites.length, rewriteCalls)
      if (plan !== "essentials") {
        const status = await ai.getAiRewriteGuardrailStatus("tenant-a", now)
        assert.equal(status?.usage.monthly, 1)
        assert.equal(status?.remainingMonthlyCredits, (await response.json()).remainingMonthlyCredits)
        const rows = structuredClone(usageRows)
        grant!.expiresAt = new Date("2026-12-01T00:00:00Z")
        assert.deepEqual((await ai.getAiRewriteGuardrailStatus("tenant-a", now))?.usage, status?.usage)
        assert.deepEqual(usageRows, rows)
      }
    })
  }
  for (const change of ["expiry", "revoke"] as const) {
    test(`${change} during actual quota reads prevents provider call and usage INSERT`, async () => {
      afterQuotaRead = () => {
        if (change === "expiry") mock.timers.setTime(end.getTime())
        else grant!.revokedAt = now
      }
      assert.equal((await aiRoute.POST(rewriteRequest())).status, 403)
      assert.equal(rewriteCalls, 0); assert.equal(aiLogWrites.length, 0); assert.equal(usageRows.length, 0)
    })
    test(`${change} after model start keeps the real successful usage and its completion timestamp`, async () => {
      afterModelStarted = () => {
        mock.timers.setTime(end.getTime())
        if (change === "revoke") grant!.revokedAt = end
      }
      assert.equal((await aiRoute.POST(rewriteRequest())).status, 200)
      assert.equal(rewriteCalls, 1); assert.equal(aiLogWrites.length, 1)
      assert.equal(aiLogWrites[0].totalTokens, 300)
      assert.equal(aiLogWrites[0].estimatedCostUsd, 100 * (0.15 / 1_000_000) + 200 * (0.6 / 1_000_000))
      assert.deepEqual(usageRows[0].createdAt, end)
    })
  }
})