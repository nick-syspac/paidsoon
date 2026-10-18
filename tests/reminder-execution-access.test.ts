import { after, before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { Resend } from "resend"
import type { EffectiveAccessProfile, TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"
import type { TrackedInvoiceWithCanonical } from "@/lib/invoices/canonical"

const now = new Date("2026-10-17T12:00:00Z")
const end = new Date("2026-10-18T12:00:00Z")
type Invoice = TrackedInvoiceWithCanonical & {
  currentStage: number; firstChasedAt: Date | null; nextEmailAt: Date | null; status: string
}
type Query = { where: { userId?: string | { in: string[] }; id?: string; status?: string }; select?: Record<string, unknown> }
let profile: EffectiveAccessProfile
let grant: TrialGrantSnapshot
let risks: BillingRiskSnapshot[]
let invoices: Invoice[]
let usage: number
let reads: { profiles: number; grants: number; risks: number; allowance: number }
let locks: unknown[][]
let updates: Array<Record<string, unknown>>
let logs: Map<string, unknown>
let providerCalls: Array<{ payload: Record<string, unknown>; options: unknown }>
let transport: "success" | "error" | "throw"
let afterLock: (() => void) | undefined
let afterTemplate: (() => void) | undefined
let afterLogRead: (() => void) | undefined
let shared: typeof import("@/lib/email/sendReminderForInvoice")
let cron: typeof import("@/app/api/cron/send-emails/route")
let internal: typeof import("@/app/api/internal/jobs/send-reminder/route")
let sender: typeof import("@/lib/email/send")
let admin: typeof import("@/app/api/admin/customers/[userId]/actions/trigger-email/route")
let audit: Array<{ success: boolean }>

function account() {
  return { ...profile, userId: "tenant-a", tenantTrialGrant: grant,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null }
}
function tenant(query: Query): void { assert.equal(query.where.userId, "tenant-a") }
const tx = {
  $executeRawUnsafe: async (...args: unknown[]) => { locks.push(args); afterLock?.(); return 1 },
  userProfile: {
    findUnique: async (q: Query) => { tenant(q); return account() },
    findMany: async (q: Query) => { reads.profiles++; assert.deepEqual(q.where.userId, { in: ["tenant-a"] }); return [account()] },
  },
  tenantTrialGrant: {
    findUnique: async (q: Query) => { tenant(q); return grant },
    findMany: async (q: Query) => { reads.grants++; assert.deepEqual(q.where.userId, { in: ["tenant-a"] }); return [{ userId: "tenant-a", ...grant }] },
  },
  tenantBillingRisk: {
    findMany: async (q: Query) => {
      if (typeof q.where.userId === "string") { tenant(q); return risks }
      reads.risks++; assert.deepEqual(q.where.userId, { in: ["tenant-a"] })
      return risks.map(r => ({ userId: "tenant-a", ...r }))
    },
  },
  trackedInvoice: {
    findUnique: async (q: Query) => invoices.find(i => i.id === q.where.id) ?? null,
    findFirst: async (q: Query) => { tenant(q); return invoices.find(i => i.id === q.where.id) ?? null },
    findMany: async (q: Query) => {
      if (q.select?.firstChasedAt) return Array.from({ length: usage }, () => ({ userId: "tenant-a", firstChasedAt: now }))
      return invoices
    },
    count: async () => { reads.allowance++; return usage },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      updates.push(data)
      const row = invoices.find(i => i.id === where.id)!
      Object.assign(row, data)
      return row
    },
  },
  promiseToPay: { findMany: async () => [], findFirst: async () => null, count: async () => 0 },
  arrangementInvoiceCoverage: { findMany: async () => [], findFirst: async () => null },
  promiseEscalationPolicy: { findMany: async () => [], findUnique: async () => null },
  schedule: { findUnique: async () => null },
  emailSettings: { findUnique: async () => null },
  emailTemplate: { findUnique: async () => { afterTemplate?.(); return null } },
  emailLog: {
    findFirst: async ({ where }: { where: { trackedInvoiceId: string; stage: number } }) => {
      const log = logs.get(`${where.trackedInvoiceId}/${where.stage}`) ?? null
      afterLogRead?.()
      return log
    },
    create: async ({ data }: { data: { trackedInvoiceId: string; stage: number } }) => {
      logs.set(`${data.trackedInvoiceId}/${data.stage}`, data)
      return data
    },
  },
}

before(async () => {
  mock.timers.enable({ apis: ["Date"], now })
  process.env.RESEND_API_KEY = "test-only-no-network"
  process.env.RESEND_FROM_EMAIL = "system@paidsoon.com.au"
  process.env.RESEND_FROM_NAME = "PaidSoon"
  process.env.CRON_SECRET = "test-cron"
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
  mock.module("@/lib/email/breachSweep", { namedExports: {
    runCatchupAndSnoozeSweep: async () => ({}), runPromiseAndArrangementBreachSweep: async () => ({}),
  } })
  mock.module("@supabase/supabase-js", { namedExports: {
    createClient: () => ({ auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@customer.com.au" } } }) } } }),
  } })
  mock.module("@/lib/admin/supportActions", { namedExports: {
    ActionReasonSchema: (await import("zod")).z.string().min(1),
    guardErrorResponse: () => { throw new Error("Unexpected guard failure") },
    requireSupportActionContext: async () => ({ ctx: { userId: "staff", userEmail: "staff@example.test",
      platformRole: { role: "platform_owner" }, adminSession: { adminDeviceId: "device" } }, requestMeta: {} }),
  } })
  mock.module("@/lib/admin/audit", { namedExports: { logAdminEvent: async (event: { success: boolean }) => { audit.push(event) } } })
  const cjs = createRequire(import.meta.url)("resend") as typeof import("resend")
  for (const Client of new Set([Resend, cjs.Resend])) {
    const sdk = new Client("test-only-no-network")
    mock.method(Object.getPrototypeOf(sdk.emails), "send", async (payload: Record<string, unknown>, options: unknown) => {
      providerCalls.push({ payload, options })
      if (transport === "throw") throw new Error("Fake transport failure")
      if (transport === "error") return { data: null, error: { name: "application_error", message: "Fake rejection" } }
      return { data: { id: "fake-message" }, error: null }
    })
  }
  mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network access") })
  mock.method(console, "error", () => {})
  sender = await import("@/lib/email/send")
  shared = await import("@/lib/email/sendReminderForInvoice")
  cron = await import("@/app/api/cron/send-emails/route")
  internal = await import("@/app/api/internal/jobs/send-reminder/route")
  admin = await import("@/app/api/admin/customers/[userId]/actions/trigger-email/route")
})
after(() => { mock.timers.reset(); mock.restoreAll() })
beforeEach(() => {
  mock.timers.setTime(now.getTime())
  profile = { subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null,
    trialEndsAt: null, billingAccessVersion: 1 }
  grant = { plan: "essentials", startsAt: new Date("2026-10-10T00:00:00Z"), expiresAt: end, revokedAt: null }
  risks = []; usage = 0; invoices = [invoice()]; locks = []; updates = []; logs = new Map()
  providerCalls = []; transport = "success"; audit = []
  reads = { profiles: 0, grants: 0, risks: 0, allowance: 0 }
  afterLock = undefined; afterTemplate = undefined; afterLogRead = undefined
})

function invoice(stage = 0, id = "invoice-a"): Invoice {
  return { id, userId: "tenant-a", currentStage: stage, firstChasedAt: stage ? now : null,
    status: "pending", nextEmailAt: now, p2pToken: "existing-token",
    customer: null, userProfile: { displayName: "Owner", userId: "tenant-a" },
    financialInvoice: { id: `financial-${id}`, amountDueCents: 5000, currency: "aud",
      dueDate: new Date("2026-10-01T00:00:00Z"), paymentUrl: null,
      contact: { email: "debtor@customer.com.au", emailLower: "debtor@customer.com.au", name: "Client" } },
  } as unknown as Invoice
}
function deny(change: "expiry" | "revoke" | "risk"): void {
  if (change === "expiry") mock.timers.setTime(end.getTime())
  if (change === "revoke") grant.revokedAt = new Date()
  if (change === "risk") risks = [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }]
}
async function execute(path: "cron" | "internal") {
  const response = path === "cron"
    ? await cron.GET(new Request("https://app.example.test/api/cron/send-emails", { headers: { authorization: "Bearer test-cron" } }))
    : await internal.POST(new Request("https://app.example.test/api/internal/jobs/send-reminder", {
      method: "POST", headers: { authorization: "Bearer test-internal", "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "tenant-a", trackedInvoiceId: "invoice-a" }),
    }))
  assert.equal(response.status, 200)
  return response.json()
}
function unchanged(original: Invoice[]): void {
  assert.deepEqual(invoices, original)
  assert.equal(providerCalls.length, 0)
  assert.equal(logs.size, 0)
  assert.equal(updates.length, 0)
}

describe("actual queued reminder execution authorization", () => {
  for (const path of ["cron", "internal"] as const) {
    for (const change of ["expiry", "revoke", "risk"] as const) {
      for (const stage of [0, 1, 2]) {
        test(`${path}: ${change} after queueing skips stage ${stage} without usage or state changes`, async () => {
          invoices = [invoice(stage)]; const original = structuredClone(invoices)
          deny(change)
          const result = await execute(path)
          if (path === "cron") {
            assert.deepEqual(result.skipped, { access_denied: 1 })
            assert.equal(result.errors, 0); assert.equal(result.emailsSent, 0)
            assert.equal(result.usageByAccount[0].usage, 0)
          } else assert.deepEqual(result, { outcome: "skipped", reason: "access_denied" })
          unchanged(original)
        })
      }
      for (const stage of [0, 1, 2]) {
        test(`${path}: ${change} between execution claim/preparation and stage ${stage} send is a skip, not an error`, async () => {
          invoices = [invoice(stage)]; const original = structuredClone(invoices)
          afterTemplate = () => deny(change)
          const result = await execute(path)
          if (path === "cron") {
            assert.deepEqual(result.skipped, { access_denied: 1 }); assert.equal(result.errors, 0)
            assert.equal(result.usageByAccount[0].usage, 0)
          } else {
            assert.deepEqual(result, { outcome: "skipped", reason: "access_denied" })
            assert.equal(locks.length, 1)
            assert.equal(locks[0][1], "tenant-a")
          }
          unchanged(original)
        })
      }
    }
    test(`${path}: exhausted capacity holds new first chases but allows underway sequence`, async () => {
      usage = 10
      assert.equal((await execute(path))[path === "cron" ? "held" : "outcome"], path === "cron" ? 1 : "held")
      assert.equal(updates.length, 0); assert.equal(logs.size, 0)
      invoices = [invoice(1)]
      const result = await execute(path)
      assert.equal(path === "cron" ? result.emailsSent : result.outcome, path === "cron" ? 1 : "sent")
      assert.equal(invoices[0].currentStage, 2); assert.deepEqual(invoices[0].firstChasedAt, now)
      assert.equal(providerCalls.length, 1); assert.equal(logs.size, 1)
      assert.deepEqual(providerCalls[0].options, { idempotencyKey: "reminder/invoice-a/2" })
    })
    for (const failure of ["error", "throw"] as const) {
      test(`${path}: real provider ${failure} remains a failure, leaves no success stub and retries`, async () => {
        transport = failure
        const result = await execute(path)
        if (path === "cron") { assert.equal(result.errors, 1); assert.deepEqual(result.skipped, { access_denied: 0 }) }
        else assert.deepEqual(result, { outcome: "error", reason: "send_failed" })
        assert.equal(logs.size, 0); assert.equal(updates.length, 0)
        assert.equal(invoices[0].firstChasedAt, null); assert.equal(invoices[0].currentStage, 0)
        transport = "success"
        await execute(path)
        assert.equal(providerCalls.length, 2); assert.equal(logs.size, 1)
        assert.deepEqual(providerCalls[0].options, providerCalls[1].options)
      })
    }
  }
  test("internal execution reauthorizes after waiting for the account advisory lock", async () => {
    const original = structuredClone(invoices)
    afterLock = () => deny("revoke")
    assert.deepEqual(await shared.sendReminderForInvoice("tenant-a", "invoice-a"), { outcome: "skipped", reason: "access_denied" })
    unchanged(original)
  })
  test("cron candidate profile/grant/risk and allowance reads stay batched across invoices", async () => {
    invoices = Array.from({ length: 5 }, (_, i) => invoice(0, `invoice-${i}`))
    const result = await execute("cron")
    assert.equal(result.emailsSent, 5)
    assert.deepEqual(reads, { profiles: 2, grants: 1, risks: 2, allowance: 0 })
    assert.equal(result.usageByAccount[0].usage, 5)
  })
  test("cron consumes the final capacity unit once and holds the next first chase", async () => {
    usage = 9
    invoices = [invoice(), invoice(0, "invoice-b")]
    const result = await execute("cron")
    assert.equal(result.emailsSent, 1); assert.equal(result.held, 1)
    assert.equal(result.usageByAccount[0].usage, 10)
    assert.equal(providerCalls.length, 1); assert.equal(logs.size, 1)
    assert.equal(invoices[1].currentStage, 0); assert.equal(invoices[1].firstChasedAt, null)
  })
  test("concurrent-writer already-sent recovery never sends twice", async () => {
    logs.set("invoice-a/1", { id: "winner-log" })
    assert.deepEqual(await shared.sendReminderForInvoice("tenant-a", "invoice-a"), { outcome: "sent", stage: 1 })
    assert.equal(providerCalls.length, 0); assert.equal(logs.size, 1)
    assert.equal(invoices[0].currentStage, 1)
  })
  test("revocation during already-sent log lookup cannot advance the sequence", async () => {
    logs.set("invoice-a/1", { id: "winner-log" })
    afterLogRead = () => deny("revoke")
    assert.deepEqual(await shared.sendReminderForInvoice("tenant-a", "invoice-a"), { outcome: "skipped", reason: "access_denied" })
    assert.equal(invoices[0].currentStage, 0); assert.equal(invoices[0].firstChasedAt, null)
    assert.equal(updates.length, 0); assert.equal(logs.size, 1); assert.equal(providerCalls.length, 0)
  })
  test("reserved recipients denied during preparation do not leave a suppressed success log", async () => {
    invoices[0].financialInvoice.contact!.email = "debtor@example.test"
    afterTemplate = () => deny("expiry")
    assert.deepEqual(await sender.sendFollowUpEmail(invoices[0], 1, "owner@example.test", "Owner"), { outcome: "skipped", reason: "access_denied" })
    assert.equal(logs.size, 0); assert.equal(providerCalls.length, 0)
  })
  test("independent paid access keeps underway reminders authorized after grant revocation", async () => {
    invoices = [invoice(2)]; usage = 10; deny("revoke")
    profile.subscriptionStatus = "active"; profile.stripeSubscriptionId = "sub_paid"
    assert.deepEqual(await shared.sendReminderForInvoice("tenant-a", "invoice-a"), { outcome: "sent", stage: 3 })
    assert.equal(invoices[0].status, "sequence_complete")
    assert.equal(providerCalls.length, 1)
  })
  test("admin sender consumer returns the typed denial instead of recording success", async () => {
    deny("revoke")
    const { NextRequest } = await import("next/server")
    const response = await admin.POST(new NextRequest("https://app.example.test/api/admin/customers/tenant-a/actions/trigger-email", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: "invoice-a", stage: 1, reason: "Requested retry" }),
    }), { params: Promise.resolve({ userId: "tenant-a" }) })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { outcome: "skipped", reason: "access_denied" })
    assert.equal(audit[0].success, false); assert.equal(logs.size, 0); assert.equal(providerCalls.length, 0)
  })
  test("cron and internal job authentication remain mandatory", async () => {
    assert.equal((await cron.GET(new Request("https://app.example.test/api/cron/send-emails"))).status, 401)
    assert.equal((await internal.POST(new Request("https://app.example.test/api/internal/jobs/send-reminder", { method: "POST" }))).status, 401)
    assert.equal(locks.length, 0); assert.equal(reads.profiles, 0); assert.equal(providerCalls.length, 0)
  })
})