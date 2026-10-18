import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { after, before, beforeEach, describe, mock, test } from "node:test"
import { Resend } from "resend"
import type { BillingRiskSnapshot, EffectiveAccessProfile, TrialGrantSnapshot } from "@/lib/billing/effectiveAccess"
import { isFeatureImplemented, PLAN_CATALOG, UNIMPLEMENTED_FEATURES } from "@/lib/subscriptionPlans"

const now = new Date("2026-10-19T07:00:00Z")
const expiry = new Date("2026-10-20T07:00:00Z")
let profile: EffectiveAccessProfile
let grant: TrialGrantSnapshot | null
let risks: BillingRiskSnapshot[]
let reads: { invoices: number; generations: number; recipients: number; snapshots: number }
let writes: Array<Record<string, unknown>>
let sends: number
let existing: { status: string; messageId: string; resendMessageId: string } | null
let settings: { enabled: boolean; emailEnabled: boolean; frequency: string; deliveryDay: string; deliveryTime: string; recipientScope: string; sendWhenEmpty: boolean }
let afterPreparation: (() => void) | undefined
let afterReservation: (() => void) | undefined
let beforeGeneration: (() => void) | undefined
let providerError: boolean
let weekly: typeof import("@/lib/email/sendWeeklyDebtorSummary")
let owners: typeof import("@/lib/email/sendOwnersDigest")
let weeklyRoute: typeof import("@/app/api/internal/jobs/send-weekly-debtor-summary/route")
let ownersRoute: typeof import("@/app/api/internal/jobs/send-owners-digest/route")
let entitlements: typeof import("@/lib/ownersDigest/entitlements")

type Query = { where: { userId: string }; select?: Record<string, unknown> }
function tenant(q: Query): void { assert.equal(q.where.userId, "tenant-a") }
const delivery = {
  findUnique: async () => existing,
  upsert: async ({ create }: { create: Record<string, unknown> }) => {
    writes.push(create); afterReservation?.(); return create
  },
  update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return data },
}
const tx = {
  userProfile: { findUnique: async (q: Query) => { tenant(q); reads.snapshots++; return { ...profile, displayName: "Owner" } } },
  tenantTrialGrant: { findUnique: async (q: Query) => { tenant(q); return grant } },
  tenantBillingRisk: { findMany: async (q: Query) => { tenant(q); return risks } },
  trackedInvoice: { findMany: async (q: Query) => {
    tenant(q); reads.invoices++; afterPreparation?.(); return []
  } },
  ownersDigestSetting: { findUnique: async (q: Query) => { tenant(q); return settings } },
  weeklyDebtorSummaryDelivery: delivery,
  ownersDigestDelivery: delivery,
}

before(async () => {
  mock.timers.enable({ apis: ["Date"], now })
  process.env.RESEND_API_KEY = "test-only-no-network"
  process.env.RESEND_FROM_EMAIL = "system@paidsoon.com.au"
  process.env.RESEND_FROM_NAME = "PaidSoon"
  process.env.INTERNAL_JOBS_SECRET = "test-internal"
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    ...tx, $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  } } })
  mock.module("@/lib/db/withUserContext", { namedExports: {
    withUserContext: async <T>(id: string, fn: (client: typeof tx) => Promise<T>) => {
      assert.equal(id, "tenant-a"); return fn(tx)
    },
  } })
  mock.module("@supabase/supabase-js", { namedExports: {
    createClient: () => ({ auth: { admin: { getUserById: async (id: string) => {
      assert.equal(id, "tenant-a"); reads.recipients++
      return { data: { user: { email: "owner@customer.com.au" } } }
    } } } }),
  } })
  mock.module("@/lib/config/supabaseEnvironmentRuntime", { namedExports: {
    getPublicSupabaseEnvironment: () => ({ publicUrl: "https://example.supabase.co" }),
  } })
  mock.module("@/lib/ownersDigest/recipient", { namedExports: {
    fetchOwnersDigestRecipientEmail: async (id: string) => {
      assert.equal(id, "tenant-a"); reads.recipients++; return "owner@customer.com.au"
    },
  } })
  entitlements = await import("@/lib/ownersDigest/entitlements")
  mock.module("@/lib/ownersDigest/service", { namedExports: {
    generateOwnersDigest: async (id: string) => {
      beforeGeneration?.()
      await entitlements.requireOwnersDigestCoreAccess(id)
      reads.generations++
      afterPreparation?.()
      return { id: "digest-a", frequency: "weekly", periodLabel: "Week", periodStart: now,
        periodEnd: expiry, status: "healthy", summary: "No changes", items: [], metrics: [], providers: [] }
    },
  } })
  const cjs = createRequire(import.meta.url)("resend") as typeof import("resend")
  for (const Client of new Set([Resend, cjs.Resend])) {
    const sdk = new Client("test-only-no-network")
    mock.method(Object.getPrototypeOf(sdk.emails), "send", async () => {
      sends++
      return providerError ? { data: null, error: { message: "Fake rejection" } }
        : { data: { id: "fake-message" }, error: null }
    })
  }
  mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network access") })
  mock.method(console, "info", () => {})
  mock.method(console, "error", () => {})
  weekly = await import("@/lib/email/sendWeeklyDebtorSummary")
  owners = await import("@/lib/email/sendOwnersDigest")
  weeklyRoute = await import("@/app/api/internal/jobs/send-weekly-debtor-summary/route")
  ownersRoute = await import("@/app/api/internal/jobs/send-owners-digest/route")
})
after(() => { mock.timers.reset(); mock.restoreAll() })
beforeEach(() => {
  mock.timers.setTime(now.getTime())
  profile = { subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null,
    trialEndsAt: null, billingAccessVersion: 1 }
  grant = { plan: "small_business", startsAt: new Date("2026-10-01T00:00:00Z"), expiresAt: expiry, revokedAt: null }
  risks = []; reads = { invoices: 0, generations: 0, recipients: 0, snapshots: 0 }
  writes = []; sends = 0; existing = null; providerError = false
  settings = { enabled: true, emailEnabled: true, frequency: "weekly", deliveryDay: "monday",
    deliveryTime: "07:00", recipientScope: "owner_only", sendWhenEmpty: true }
  afterPreparation = undefined; afterReservation = undefined; beforeGeneration = undefined
})

function deny(change: "expiry" | "revoke" | "risk"): void {
  if (change === "expiry") mock.timers.setTime(expiry.getTime())
  if (change === "revoke") grant!.revokedAt = new Date()
  if (change === "risk") risks = [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }]
}
function request(auth = "Bearer test-internal", body: unknown = { userId: "tenant-a" }): Request {
  return new Request("https://app.example.test/api/internal/jobs/summary", {
    method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body),
  })
}

for (const kind of ["weekly", "owners"] as const) {
  describe(`${kind} summary authoritative execution`, () => {
    const send = () => kind === "weekly" ? weekly.sendWeeklyDebtorSummary("tenant-a")
      : owners.sendOwnersDigest("tenant-a", now)
    const post = (req: Request) => kind === "weekly" ? weeklyRoute.POST(req) : ownersRoute.POST(req)

    for (const plan of ["small_business", "business_pro"] as const) {
      test(`processes ${plan} grant despite inactive Essentials raw tier`, async () => {
        grant!.plan = plan
        assert.equal((await send()).status, "sent")
        assert.equal(sends, 1)
        assert.equal(writes.filter(w => w.status === "sent").length, 1)
        assert.ok(reads.snapshots >= 3)
      })
    }
    for (const plan of ["essentials", "business_control"] as const) {
      test(`does not promote ${plan} grant to raw Business Pro email features`, async () => {
        profile.subscriptionTier = "business_pro"; grant!.plan = plan
        assert.deepEqual(await send(), { status: "skipped", reason: kind === "weekly"
          ? "weekly_summary_not_available" : "owners_digest_email_not_available" })
        assert.equal(reads.invoices + reads.generations, 0)
        assert.equal(sends, 0); assert.deepEqual(writes, [])
      })
    }
    for (const change of ["expiry", "revoke", "risk"] as const) {
      test(`${change} after queueing skips before computation`, async () => {
        deny(change)
        assert.deepEqual(await send(), { status: "skipped", reason: "no_access" })
        assert.equal(reads.invoices + reads.generations + reads.recipients, 0)
        assert.equal(sends, 0); assert.deepEqual(writes, [])
      })
      test(`${change} after preparation produces no delivery attempt or provider call`, async () => {
        afterPreparation = () => deny(change)
        assert.deepEqual(await send(), { status: "skipped", reason: "no_access" })
        assert.equal(sends, 0); assert.deepEqual(writes, [])
      })
      test(`${change} during reservation is checked immediately before Resend`, async () => {
        afterReservation = () => deny(change)
        assert.deepEqual(await send(), { status: "skipped", reason: "no_access" })
        assert.equal(sends, 0)
        assert.equal(writes.at(-1)?.status, "skipped")
        assert.ok(writes.every(w => w.status !== "sent" && !w.sentAt))
        afterReservation = undefined; grant!.revokedAt = null; risks = []; mock.timers.setTime(now.getTime())
        assert.equal((await send()).status, "sent", "a skipped attempt does not consume this period")
      })
    }
    for (const status of ["active", "past_due", "trialing"] as const) {
      test(`${status} uses preferred Stripe plan, not a more generous retained grant`, async () => {
        profile.subscriptionStatus = status; profile.stripeSubscriptionId = "sub-a"
        profile.subscriptionTier = "business_control"
        assert.equal((await send()).status, "skipped"); assert.equal(sends, 0)
        profile.subscriptionTier = "small_business"; grant!.revokedAt = now
        assert.equal((await send()).status, "sent"); assert.equal(sends, 1)
      })
    }
    test("hidden Accountant Partner grant is denied, legitimate paid partner remains eligible", async () => {
      grant!.plan = "accountant_partner"
      assert.deepEqual(await send(), { status: "skipped", reason: "no_access" })
      profile.subscriptionStatus = "active"; profile.stripeSubscriptionId = "sub-partner"
      profile.subscriptionTier = "accountant_partner"
      assert.equal((await send()).status, "sent")
    })
    test("existing sent-period dedup prevents another send", async () => {
      existing = { status: "sent", messageId: "old", resendMessageId: "old" }
      assert.deepEqual(await send(), { status: "already_sent", messageId: "old" })
      assert.equal(sends, 0); assert.deepEqual(writes, [])
    })
    test("SDK error-valued response cannot create a false sent record", async () => {
      providerError = true
      await assert.rejects(send)
      assert.equal(writes.at(-1)?.status, "failed")
      assert.ok(writes.every(w => w.status !== "sent" && !w.sentAt))
    })
    test("preferred plan changing during preparation rechecks features rather than the retained grant", async () => {
      afterPreparation = () => {
        profile.subscriptionStatus = "active"; profile.stripeSubscriptionId = "sub-new"
        profile.subscriptionTier = "business_control"
      }
      assert.deepEqual(await send(), { status: "skipped", reason: kind === "weekly"
        ? "weekly_summary_not_available" : "owners_digest_email_not_available" })
      assert.equal(sends, 0); assert.deepEqual(writes, [])
    })
    for (const status of ["unpaid", "incomplete", "incomplete_expired", "unknown", "active"] as const) {
      test(`${status} without an authoritative subscription cannot authorize via raw tier`, async () => {
        profile.subscriptionStatus = status; profile.subscriptionTier = "business_pro"
        if (status === "active") grant = null
        assert.deepEqual(await send(), { status: "skipped", reason: "no_access" })
        assert.equal(reads.invoices + reads.generations, 0)
        assert.equal(sends, 0); assert.deepEqual(writes, [])
      })
    }
    test("internal route preserves auth and input validation before access reads", async () => {
      assert.equal((await post(request("Bearer wrong"))).status, 401)
      assert.equal((await post(request("Bearer test-internal", {}))).status, 400)
      assert.equal(reads.snapshots, 0); assert.equal(sends, 0)
    })
    test("internal route processes grant and returns structured execution skip after revocation", async () => {
      assert.equal((await (await post(request())).json()).status, "sent")
      writes = []; sends = 0; deny("revoke")
      const response = await post(request())
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { status: "skipped", reason: "no_access" })
      assert.equal(sends, 0); assert.deepEqual(writes, [])
    })
  })
}

test("Owners Digest expiry at independent generation guard becomes a structured skip", async () => {
  beforeGeneration = () => deny("expiry")
  assert.deepEqual(await owners.sendOwnersDigest("tenant-a", now), { status: "skipped", reason: "no_access" })
  assert.equal(reads.generations, 0); assert.equal(sends, 0); assert.deepEqual(writes, [])
})
test("Owners Digest service entitlements use one allowed effective plan snapshot with no null fallback", async () => {
  grant!.plan = "business_control"
  assert.deepEqual(await entitlements.getOwnersDigestEntitlements("tenant-a"), {
    tier: "business_control", hasCoreAccess: true, hasEmailAccess: false, hasHistoryAccess: true,
  })
  assert.equal(reads.snapshots, 1)
  deny("expiry")
  assert.deepEqual(await entitlements.getOwnersDigestEntitlements("tenant-a"), {
    tier: null, hasCoreAccess: false, hasEmailAccess: false, hasHistoryAccess: false,
  })
  await assert.rejects(() => entitlements.requireOwnersDigestCoreAccess("tenant-a"), entitlements.OwnersDigestAccessError)
})
test("Owners Digest cadence, enabled and empty settings remain authoritative", async () => {
  settings.emailEnabled = false
  assert.deepEqual(await owners.sendOwnersDigest("tenant-a", now), { status: "skipped", reason: "owners_digest_email_disabled" })
  settings.emailEnabled = true; settings.frequency = "off"
  assert.deepEqual(await owners.sendOwnersDigest("tenant-a", now), { status: "skipped", reason: "owners_digest_not_due" })
  settings.frequency = "weekly"; settings.sendWhenEmpty = false
  assert.deepEqual(await owners.sendOwnersDigest("tenant-a", now), { status: "skipped", reason: "owners_digest_empty" })
  assert.equal(sends, 0); assert.deepEqual(writes, [])
})
test("existing catalog readiness and hidden partner flags are not enabled by execution grants", () => {
  assert.equal(isFeatureImplemented("weekly_summary_email"), false)
  assert.ok(UNIMPLEMENTED_FEATURES.includes("multi_client_management"))
  assert.equal(PLAN_CATALOG.accountant_partner.visibility, "contact_only")
  assert.equal(PLAN_CATALOG.accountant_partner.features.multi_client_management, false)
})