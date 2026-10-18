import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type { AdminGuardContext } from "@/lib/admin/guard"
import type { Prisma, TenantTrialNotification, TenantTrialOperation, TenantTrialGrant, UserProfile } from "@/lib/generated/prisma/client"
import type { TrialNotificationSendOutcome } from "@/lib/email/sendTrialAccessNotification"
import type { TrialAccessNotificationPayload } from "@/lib/email/trialAccessNotification"

const tenant = "tenant", id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const start = new Date("2026-10-16T00:00:00Z"), end = new Date("2026-11-16T00:00:00Z")
const request = { ipAddress: "127.0.0.1", userAgent: "test-delivery", requestId: "current-request" }
type Row = Record<string, unknown>
let api: typeof import("@/lib/email/trialAccessDelivery")
let post: typeof import("@/lib/email/trialAccessPostCommit")
let preview: typeof import("@/lib/billing/trialAccessPreview")
let resolver: typeof import("@/lib/billing/effectiveAccess")
let db: Database, time: Date, owner: AdminGuardContext, sends: { payload: TrialAccessNotificationPayload; key: string }[]
let outcome: TrialNotificationSendOutcome, sendHook: (() => Promise<void>) | undefined, contacts: number
let service: ReturnType<typeof api.createTrialAccessDeliveryService>
let system: ReturnType<typeof api.createTrialAccessSystemDelivery>
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, v]) => v instanceof Date ? row[key] instanceof Date && +(row[key] as Date) === +v : row[key] === v)
}
class Database {
  profile = { userId: tenant, subscriptionTier: "essentials", subscriptionStatus: "canceled", stripeCustomerId: null,
    stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 8, pendingTrialOperationId: null,
    pendingBillingMutationId: null } as UserProfile
  grant = { userId: tenant, id: "grant", plan: "business_control", startsAt: start, expiresAt: end,
    revokedAt: null, lastOperationId: id } as TenantTrialGrant
  op = { id, userId: tenant, actorUserId: "owner", adminSessionId: "original", status: "succeeded", notify: true,
    action: "extend_or_grant", source: "admin_grant", reason: "private reason", targetPlan: "business_control",
    targetExpiresAt: end, stripeSubscriptionId: null, stripeCustomerId: null } as TenantTrialOperation
  row = { id: "delivery", userId: tenant, operationId: id, recipientEmail: null, recipientName: null, contactSource: null,
    renderedPayload: null, status: "pending", attempts: 0, firstAttemptAt: null, lastAttemptAt: null,
    providerIdempotencyKey: `trial-access/${id}`, providerMessageId: null, failureCode: null, failureSummary: null,
    leaseOwner: null, leaseExpiresAt: null, fencingToken: 0, sentAt: null } as TenantTrialNotification
  audits: Row[] = []
  locked = false
  fault: "attempt" | "result" | "commit-after-send" | null = null
  afterCommit: (() => void) | undefined
  auditHook: ((phase: unknown) => void) | undefined
  tail = Promise.resolve()
  snapshot() { return structuredClone({ profile: this.profile, grant: this.grant, op: this.op, row: this.row, audits: this.audits }) }
  transaction = async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    const previous = this.tail; let release!: () => void
    this.tail = new Promise<void>((r) => { release = r }); await previous
    const original = this.snapshot()
    const tx = {
      $executeRawUnsafe: async (_sql: string, key: string) => { assert.equal(key, `billing-access:${tenant}`); this.locked = true },
      userProfile: { findUnique: async () => structuredClone(this.profile) },
      tenantTrialGrant: { findUnique: async () => structuredClone(this.grant) },
      tenantBillingRisk: { findMany: async () => [] },
      tenantTrialOperation: { findUnique: async ({ where }: { where: Row }) => where.id === this.op.id ? structuredClone(this.op) : null },
      tenantTrialNotification: {
        findUnique: async () => structuredClone(this.row),
        updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          assert.ok(this.locked)
          if (!matches(this.row as unknown as Row, where)) return { count: 0 }
          for (const [key, value] of Object.entries(structuredClone(data))) {
            (this.row as unknown as Row)[key] = value && typeof value === "object" && "increment" in value
              ? Number((this.row as unknown as Row)[key]) + Number(value.increment) : value
          }
          return { count: 1 }
        },
      },
      adminAuditEvent: {
        findFirst: async () => ({ actorEmail: "owner@example.test" }),
        create: async ({ data }: { data: Row }) => {
          const meta = data.metadata as Row
          this.auditHook?.(meta.phase)
          if (this.fault === meta.phase) throw new Error("private audit recipient@example.test")
          this.audits.push(structuredClone(data)); return data
        },
      },
    }
    try {
      const result = await run(tx as unknown as Prisma.TransactionClient)
      if (this.fault === "commit-after-send" && sends.length) throw new Error("commit failed")
      this.afterCommit?.(); this.afterCommit = undefined
      return result
    } catch (e) { Object.assign(this, original); throw e }
    finally { this.locked = false; release() }
  }
  refreshResult() {
    this.op.result = { operationId: id, status: "succeeded", action: this.op.action, source: this.op.source,
      targetPlan: this.op.targetPlan, targetExpiresAt: this.op.targetExpiresAt?.toISOString() ?? null,
      notificationStatus: "pending", after: preview.safeTrialAccessSnapshot(resolver.resolveEffectiveAccess({
        profile: this.profile, grant: this.grant, billingRisks: [],
      }, time), this.profile) } as unknown as Prisma.JsonObject
  }
}
before(async () => {
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: new Proxy({}, { get() { throw new Error("live database forbidden") } }) } })
  mock.module("@/lib/admin/guard", { namedExports: { requireAdminElevation: async () => { throw new Error("unmocked auth") } } })
  mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: () => { throw new Error("live Stripe forbidden") } } })
  api = await import("@/lib/email/trialAccessDelivery")
  post = await import("@/lib/email/trialAccessPostCommit")
  preview = await import("@/lib/billing/trialAccessPreview")
  resolver = await import("@/lib/billing/effectiveAccess")
})
beforeEach(() => {
  time = new Date(start); sends = []; contacts = 0; outcome = { status: "sent", messageId: "message-1" }; sendHook = undefined
  db = new Database(); db.refreshResult()
  owner = { userId: "owner", userEmail: "owner@example.test", platformRole: { userId: "owner", role: "platform_owner", status: "active" },
    adminSession: { id: "original", userId: "owner", revokedAt: null, expiresAt: new Date("2027-01-01") } } as AdminGuardContext
  const deps = { transaction: db.transaction, now: () => time, authorize: async () => owner,
    env: { NODE_ENV: "test" as const, RESEND_FROM_EMAIL: "system@example.test", NEXT_PUBLIC_APP_URL: "https://app.example.test" },
    contact: async () => { contacts++; return { email: "billing@example.test", name: "Billing", source: "stripe_billing" as const, nameMissing: false } },
    send: async (payload: TrialAccessNotificationPayload, key: string) => {
      assert.equal(db.locked, false); assert.equal(db.row.status, "sending"); assert.ok(db.row.firstAttemptAt)
      assert.ok(db.audits.some((a) => (a.metadata as Row).phase === "attempt")); assert.ok(db.row.renderedPayload)
      sends.push({ payload: structuredClone(payload), key }); await sendHook?.(); return outcome
    } }
  service = api.createTrialAccessDeliveryService(deps); system = api.createTrialAccessSystemDelivery(deps)
})
const retry = () => service.retry(tenant, id, request)
const automatic = () => system.afterCommit(tenant, id, request)
const lapse = () => { time = new Date(+time + 60_001) }
const access = () => structuredClone({ profile: db.profile, grant: db.grant, op: db.op })

describe("trial delivery claims and retention — tasks 7.3/7.4", () => {
  test("default off does not initialize contact, write audit or dispatch", async () => {
    db.op.notify = false; const old = db.snapshot()
    assert.deepEqual(await automatic(), { status: "not_requested", failureCode: null }); assert.deepEqual(db.snapshot(), old); assert.equal(contacts, 0)
  })
  test("postcommit send freezes payload/key, app URL and sender; sent retry is a no-op and access/quotas are never written", async () => {
    const original = access(); assert.equal((await automatic()).status, "sent")
    assert.deepEqual(access(), original); assert.equal(db.row.attempts, 1); assert.equal(db.row.providerMessageId, "message-1")
    assert.equal(sends[0].key, `trial-access/${id}`); assert.deepEqual(db.row.renderedPayload, sends[0].payload)
    assert.equal((await retry()).status, "sent"); assert.equal((await automatic()).status, "sent"); assert.equal(sends.length, 1); assert.equal(contacts, 1)
    assert.deepEqual(db.audits.map((a) => (a.metadata as Row).phase), ["attempt", "result"])
    const serialized = JSON.stringify(db.audits)
    assert.ok(!serialized.includes("billing@example.test")); assert.ok(!serialized.includes("html"))
    assert.ok(db.audits.every((a) => a.requestId === request.requestId && a.adminSessionId === "original"))
    assert.equal((db.audits[0].metadata as Row).executor, "system")
  })
  test("strict current owner and original session are required on retry, including terminal no-ops", async () => {
    for (const mutate of [() => { owner.adminSession.id = "fresh" }, () => { owner.userId = "different" },
      () => { owner.platformRole.status = "disabled" }, () => { owner.platformRole.role = "platform_admin" },
      () => { owner.adminSession.expiresAt = start }]) {
      const old = structuredClone(owner); mutate(); await assert.rejects(retry); owner = old
    }
    await assert.rejects(() => service.retry(tenant, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", request))
    assert.equal(sends.length, 0)
  })
  test("system dispatch checks tenant, confirmed success and notify without relying on expired human session", async () => {
    db.op.status = "pending"; await assert.rejects(automatic); db.op.status = "succeeded"
    db.op.userId = "foreign"; await assert.rejects(automatic); db.op.userId = tenant
    owner.adminSession.expiresAt = start; assert.equal((await automatic()).status, "sent")
  })
  test("concurrent automatic send and explicit retries dispatch once", async () => {
    let release!: () => void; let entered!: () => void
    const waiting = new Promise<void>((r) => { release = r }), entry = new Promise<void>((r) => { entered = r })
    sendHook = async () => { entered(); await waiting }
    const first = automatic(); await entry
    const rest = await Promise.all([retry(), retry(), automatic()]); assert.ok(rest.every((r) => r.status === "sending"))
    release(); await first; assert.equal(sends.length, 1)
  })
  test("lease takeover replays identical key once and rejects the stale result", async () => {
    let release!: () => void; let entered!: () => void
    const waiting = new Promise<void>((r) => { release = r }), entry = new Promise<void>((r) => { entered = r })
    let n = 0
    sendHook = async () => { if (++n === 1) { entered(); await waiting } }
    const first = automatic(); await entry; lapse()
    const newer = await retry(); assert.equal(newer.status, "sent")
    release(); await assert.rejects(first); assert.equal(db.row.status, "sent")
    assert.equal(db.row.fencingToken, 2); assert.deepEqual(sends[0], sends[1])
  })
  test("expiry between committed claim and dispatch suppresses a proven-unsent email", async () => {
    db.afterCommit = () => { db.grant.revokedAt = start }
    assert.equal((await automatic()).status, "superseded"); assert.equal(sends.length, 0)
  })
  test("result audit that crosses the lease rolls back the result instead of marking sent", async () => {
    db.auditHook = (phase) => { if (phase === "result") lapse() }
    await assert.rejects(automatic); assert.equal(db.row.status, "sending"); assert.equal(db.row.providerMessageId, null)
    assert.equal(db.audits.length, 1)
  })
  test("definitive-unsent failures can explicitly retry after 24h with identical frozen recipient/payload/key", async () => {
    outcome = { status: "not_sent", code: "provider_rejected" }; const original = access()
    assert.equal((await automatic()).status, "failed"); const frozen = structuredClone(db.row.renderedPayload), first = db.row.firstAttemptAt
    time = new Date(+start + 24 * 3600000 + 1); outcome = { status: "sent", messageId: "message-2" }
    assert.equal((await automatic()).status, "failed"); assert.equal(sends.length, 1)
    assert.equal((await retry()).status, "sent"); assert.deepEqual(sends[0], sends[1]); assert.deepEqual(db.row.renderedPayload, frozen)
    assert.deepEqual(db.row.firstAttemptAt, first); assert.equal(contacts, 1); assert.deepEqual(access(), original)
  })
  for (const offset of [-1, 0, 1]) test(`unknown replay strict 24h boundary ${offset}ms`, async () => {
    outcome = { status: "unknown", code: "provider_uncertain" }; await automatic()
    time = new Date(+start + 24 * 3600000 + offset); outcome = { status: "sent", messageId: "recovered" }
    const r = await retry(); assert.equal(r.status, offset < 0 ? "sent" : "unknown")
    assert.equal(sends.length, offset < 0 ? 2 : 1)
    if (offset < 0) assert.deepEqual(sends[0], sends[1]); else assert.equal(r.failureCode, "provider_reconciliation_required")
  })
  test("replay rejection after uncertain attempt cannot become proven-unsent or reopen late retry", async () => {
    outcome = { status: "unknown", code: "provider_uncertain" }; await automatic(); lapse()
    outcome = { status: "not_sent", code: "provider_rejected" }; assert.equal((await retry()).status, "unknown")
    time = new Date(+start + 24 * 3600000); await retry(); assert.equal(sends.length, 2)
  })
  test("SDK exceptions are unknown with one bounded call, no raw failure/PII and no access rollback", async () => {
    const original = access(); sendHook = async () => { throw new Error("cached500 secret billing@example.test") }
    assert.equal((await automatic()).status, "unknown"); assert.equal(sends.length, 1); assert.deepEqual(access(), original)
    assert.ok(!JSON.stringify(db.row.failureCode).includes("secret"))
  })
  test("attempt audit failure rolls back payload/claim and prevents sending", async () => {
    db.fault = "attempt"; const old = db.snapshot(); await assert.rejects(automatic)
    assert.deepEqual(db.snapshot(), old); assert.equal(sends.length, 0)
  })
  for (const fault of ["result", "commit-after-send"] as const) test(`${fault} failure after send retains original payload and sending lease; late recovery blocks`, async () => {
    db.fault = fault; await assert.rejects(automatic); assert.equal(db.row.status, "sending"); assert.equal(db.row.attempts, 1)
    assert.equal(db.row.providerMessageId, null); assert.deepEqual(db.row.renderedPayload, sends[0].payload)
    db.fault = null; time = new Date(+start + 24 * 3600000); assert.equal((await retry()).status, "unknown"); assert.equal(sends.length, 1)
  })
  test("stale executor cannot commit after lease takeover", async () => {
    sendHook = async () => { db.row.leaseOwner = "new-executor"; db.row.fencingToken++; lapse() }
    await assert.rejects(automatic); assert.equal(db.row.status, "sending"); assert.equal(db.row.providerMessageId, null)
  })
  for (const mode of ["expired", "revoked", "plan_changed", "later_operation", "paid"]) test(`${mode} suppresses obsolete grant success email`, async () => {
    if (mode === "expired") time = end
    if (mode === "revoked") db.grant.revokedAt = start
    if (mode === "plan_changed") db.grant.plan = "business_pro"
    if (mode === "later_operation") db.grant.lastOperationId = "new-operation"
    if (mode === "paid") { db.profile.stripeSubscriptionId = "sub_1"; db.profile.subscriptionStatus = "active" }
    assert.equal((await automatic()).status, "superseded"); assert.equal(sends.length, 0)
  })
  test("unknown obsolete email stays unknown for reconciliation, never sent or falsely unsent", async () => {
    outcome = { status: "unknown", code: "provider_uncertain" }; await automatic(); db.grant.revokedAt = start
    assert.equal((await retry()).status, "unknown"); assert.equal(sends.length, 1)
  })
  for (const change of ["paid", "canceled", "new_plan", "new_trial_end", "new_subscription"]) test(`Stripe ${change} suppresses an old extension message`, async () => {
    db.op.source = "stripe_trial"; db.op.stripeCustomerId = "cus_1"; db.op.stripeSubscriptionId = "sub_1"
    Object.assign(db.profile, { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: "trialing",
      subscriptionTier: "business_control", trialEndsAt: end })
    db.refreshResult()
    if (change === "paid") db.profile.subscriptionStatus = "active"
    if (change === "canceled") db.profile.subscriptionStatus = "canceled"
    if (change === "new_plan") db.profile.subscriptionTier = "business_pro"
    if (change === "new_trial_end") db.profile.trialEndsAt = new Date(+end + 1000)
    if (change === "new_subscription") db.profile.stripeSubscriptionId = "sub_2"
    assert.equal((await automatic()).status, "superseded"); assert.equal(sends.length, 0)
  })
  test("current Stripe extension sends accurate copy without changing billing", async () => {
    db.op.source = "stripe_trial"; db.op.stripeCustomerId = "cus_1"; db.op.stripeSubscriptionId = "sub_1"
    Object.assign(db.profile, { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: "trialing",
      subscriptionTier: "business_control", trialEndsAt: end }); db.refreshResult()
    const original = access(); assert.equal((await automatic()).status, "sent"); assert.deepEqual(access(), original)
    assert.match(sends[0].payload.text, /first billing/)
  })
  test("revocation accurately preserves paid access, but obsolete independent access copy is suppressed", async () => {
    db.op.action = "revoke_grant"; db.op.targetPlan = null; db.op.targetExpiresAt = null; db.grant.revokedAt = start
    db.profile.subscriptionStatus = "active"; db.profile.stripeSubscriptionId = "sub_1"; db.refreshResult()
    assert.equal((await automatic()).status, "sent"); assert.match(sends[0].payload.text, /independent paid/)
    db.row.status = "pending"; db.row.attempts = 0; db.row.firstAttemptAt = null; db.row.sentAt = null
    db.row.providerMessageId = null
    db.profile.subscriptionStatus = "canceled"; assert.equal((await retry()).status, "superseded")
  })
  test("missing contact remains blocked without retargeting or a provider attempt", async () => {
    db.row.status = "blocked"; db.row.failureCode = "trial_notification_contact_unavailable"
    assert.equal((await retry()).status, "blocked"); assert.equal(contacts, 0); assert.equal(sends.length, 0)
  })
  test("payload is unchanged when sender/URL configuration changes on retry", async () => {
    outcome = { status: "not_sent", code: "missing_configuration" }; await automatic()
    process.env.RESEND_FROM_EMAIL = "new@example.test"; process.env.NEXT_PUBLIC_APP_URL = "https://changed.example.test"
    try { await retry(); assert.deepEqual(sends[0], sends[1]) }
    finally { delete process.env.RESEND_FROM_EMAIL; delete process.env.NEXT_PUBLIC_APP_URL }
  })
  test("postcommit wrapper returns delivery uncertainty separately and never mutates immutable access result", async () => {
    const original = { operationId: id, status: "succeeded", notificationStatus: "pending" }
    const r = await post.afterTrialAccessCommit(tenant, original, request, async () => { throw new Error("audit failed") })
    assert.equal(r.status, "succeeded"); assert.equal(r.notification?.status, "unknown"); assert.ok(!("notification" in original))
  })
  test("installed Resend fetch transport has one request and no automatic retry loop", () => {
    const sdk = readFileSync("node_modules/resend/dist/index.mjs", "utf8")
    const transport = sdk.slice(sdk.indexOf("async fetchRequest("), sdk.indexOf("async get(", sdk.indexOf("async fetchRequest(")))
    assert.equal((transport.match(/await fetch\(/g) ?? []).length, 1); assert.ok(!/\bretry|\bwhile\s*\(|\bfor\s*\(/.test(transport.split("async post(")[0]))
  })
})