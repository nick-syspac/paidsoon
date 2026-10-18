import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type Stripe from "stripe"
import type { AdminGuardContext } from "@/lib/admin/guard"
import type { Prisma, TenantTrialNotification } from "@/lib/generated/prisma/client"
import type { TrialContactCustomer, TrialContactOwner } from "@/lib/email/trialAccessContact"

const tenant = "11111111-1111-4111-8111-111111111111"
const foreign = "22222222-2222-4222-8222-222222222222"
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const instant = new Date("2026-10-16T00:00:00Z")
let api: typeof import("@/lib/email/trialAccessContactService")
let core: typeof import("@/lib/email/trialAccessContact")
let service: ReturnType<typeof api.createTrialAccessContactService>
let owner: AdminGuardContext
let db: Database
let customer: TrialContactCustomer | null
let authUser: TrialContactOwner | null
let stripeError: unknown, ownerError: unknown
let customerReads: string[], ownerReads: string[]
let authorizeCalls: number, authError: Error | null
let readHook: (() => void) | undefined
let sdkError: object | null
let clientOptions: unknown[]

type Row = Record<string, unknown>
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "renderedPayload") return row[key] === null
    if (value && typeof value === "object") return !!row[key] && matches(row[key] as Row, value as Row)
    return row[key] === value
  })
}
class Database {
  profile: Row | null = { userId: tenant, stripeCustomerId: "cus_billing" }
  operation = { userId: tenant, actorUserId: "owner", adminSessionId: "session", status: "succeeded", notify: true }
  row = { id: "notification", userId: tenant, operationId, recipientEmail: null, recipientName: null, contactSource: null,
    renderedPayload: null, status: "pending", attempts: 0, firstAttemptAt: null, lastAttemptAt: null,
    providerMessageId: null, providerIdempotencyKey: `trial-access/${operationId}`, failureCode: null, failureSummary: null,
    leaseOwner: null, leaseExpiresAt: null, fencingToken: 0, sentAt: null, createdAt: instant, updatedAt: instant } as TenantTrialNotification
  reads = 0
  writes: Prisma.TenantTrialNotificationUpdateManyArgs[] = []
  fault = false
  casLoss: (() => void) | undefined
  private tail = Promise.resolve()
  transaction = async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    const original = structuredClone(this.row)
    let locked = false
    const tx = {
      $executeRawUnsafe: async (sql: string, key: string) => {
        assert.equal(sql, "SELECT pg_advisory_xact_lock(hashtext($1))")
        assert.ok([`billing-access:${tenant}`, `billing-access:${foreign}`].includes(key))
        locked = true
      },
      userProfile: { findUnique: async ({ where, select }: Prisma.UserProfileFindUniqueArgs) => {
        assert.ok(locked); this.reads++
        assert.deepEqual(select, { userId: true, stripeCustomerId: true })
        return this.profile?.userId === where.userId ? structuredClone(this.profile) : null
      } },
      tenantTrialNotification: {
        findFirst: async ({ where }: { where: Row }) => {
          assert.ok(locked); this.reads++
          return matches({ ...this.row, operation: this.operation }, where) ? structuredClone(this.row) : null
        },
        updateMany: async (args: Prisma.TenantTrialNotificationUpdateManyArgs) => {
          assert.ok(locked)
          this.writes.push(args)
          if (this.fault) throw new Error("private database failure with recipient@example.test")
          if (this.casLoss) { this.casLoss(); return { count: 0 } }
          if (!matches({ ...this.row, operation: this.operation }, args.where as Row)) return { count: 0 }
          assert.ok(Object.keys(args.data).every((key) => ["recipientEmail", "recipientName", "contactSource", "status", "failureCode", "failureSummary"].includes(key)))
          Object.assign(this.row, args.data)
          return { count: 1 }
        },
      },
    }
    try { return await run(tx as unknown as Prisma.TransactionClient) }
    catch (error) { this.row = original; throw error }
    finally { release() }
  }
}
async function customerReader(id: string): Promise<TrialContactCustomer | null> {
  customerReads.push(id); readHook?.()
  if (stripeError) throw stripeError
  return structuredClone(customer)
}
async function ownerReader(id: string): Promise<TrialContactOwner | null> {
  ownerReads.push(id)
  if (ownerError) throw ownerError
  return structuredClone(authUser)
}
function stripe(): Stripe {
  return { customers: { retrieve: async (...args: unknown[]) => {
    assert.equal(args.length, 1, "no Connect account/options")
    return customerReader(args[0] as string)
  } } } as unknown as Stripe
}
async function authorize(): Promise<AdminGuardContext> {
  authorizeCalls++
  if (authError) throw authError
  return owner
}
function fresh() {
  return core.resolveTrialAccessContact({ userId: tenant, stripeCustomerId: "cus_billing" }, {
    customer: customerReader, owner: ownerReader,
  })
}
const fallback = { email: "owner@example.test", name: null, source: "owner_fallback", nameMissing: true }
const billing = { email: "billing@example.test", name: "Billing Team", source: "stripe_billing", nameMissing: false }

before(async () => {
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: { $transaction: <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => db.transaction(run) } } })
  mock.module("@/lib/admin/guard", { namedExports: { requireAdminElevation: async (options: unknown) => {
    assert.deepEqual(options, { minRole: "platform_owner" }); return authorize()
  } } })
  mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: (options: unknown) => {
    assert.deepEqual(options, { maxNetworkRetries: 0 }); return stripe()
  } } })
  mock.module("@/lib/config/supabaseEnvironmentRuntime", { namedExports: { getPublicSupabaseEnvironment: () => ({ publicUrl: "https://example.test" }) } })
  mock.module("@supabase/supabase-js", { namedExports: { createClient: (...args: unknown[]) => {
    clientOptions = args
    return { auth: { admin: { getUserById: async (id: string) => ({ data: { user: await ownerReader(id) }, error: sdkError }) } } }
  } } })
  core = await import("@/lib/email/trialAccessContact")
  api = await import("@/lib/email/trialAccessContactService")
})
beforeEach(() => {
  db = new Database()
  customer = { id: "cus_billing", email: "billing@example.test", name: "Billing Team", metadata: { userId: tenant, user_id: tenant } }
  authUser = { id: tenant, email: "owner@example.test" }
  customerReads = []; ownerReads = []; clientOptions = []
  stripeError = ownerError = undefined; readHook = undefined; sdkError = null
  authorizeCalls = 0; authError = null
  owner = { userId: "owner", userEmail: "staff@example.test", platformRole: { userId: "owner", role: "platform_owner", status: "active" },
    adminSession: { id: "session", userId: "owner", revokedAt: null, expiresAt: new Date("2099-01-01") } } as AdminGuardContext
  service = api.createTrialAccessContactService({ transaction: db.transaction, authorize, now: () => instant, stripe, owner: ownerReader })
})

describe("trial billing contact resolution (task 7.1)", () => {
  test("uses fresh verified linked platform billing email/name only", async () => {
    assert.deepEqual(await service.resolve(tenant), billing)
    assert.deepEqual(customerReads, ["cus_billing"]); assert.deepEqual(ownerReads, [])
    customer!.email = "changed@example.test"
    assert.equal((await service.resolve(tenant)).email, "changed@example.test")
    assert.equal(db.writes.length, 0)
  })
  test("accepts sparse tenant metadata only with exact profile customer binding", async () => {
    customer!.metadata = {}
    assert.deepEqual(await fresh(), billing)
  })
  for (const [label, change] of [
    ["missing customer", () => { customer = null }],
    ["deleted customer", () => { customer!.deleted = true }],
    ["missing email", () => { customer!.email = null }],
    ["invalid email", () => { customer!.email = "not-an-email" }],
    ["header injection", () => { customer!.email = "billing@example.test\r\nBcc: debtor@example.test" }],
    ["wrong returned customer", () => { customer!.id = "cus_debtor" }],
    ["conflicting userId", () => { customer!.metadata = { userId: foreign } }],
    ["conflicting user_id", () => { customer!.metadata = { userId: tenant, user_id: foreign } }],
    ["missing provider object", () => { stripeError = { code: "resource_missing" } }],
    ["unreadable provider", () => { stripeError = new Error("private provider details billing@example.test") }],
  ] as const) {
    test(`${label} uses labeled owner fallback without borrowing the billing name`, async () => {
      change()
      assert.deepEqual(await fresh(), fallback)
      assert.deepEqual(ownerReads, [tenant])
    })
  }
  test("unlinked tenant reads only its Supabase owner contact", async () => {
    db.profile!.stripeCustomerId = null
    assert.deepEqual(await service.resolve(tenant), fallback)
    assert.deepEqual(customerReads, [])
  })
  for (const missing of [null, "", "  ", "Bad\nName"]) {
    test(`missing/unsafe billing name ${JSON.stringify(missing)} stays explicitly null`, async () => {
      customer!.name = missing
      assert.deepEqual(await fresh(), { ...billing, name: null, nameMissing: true })
      assert.deepEqual(ownerReads, [])
    })
  }
  for (const [label, value] of [
    ["missing", null], ["deleted", { id: tenant, email: "owner@example.test", deleted_at: "2026-10-15" }],
    ["foreign", { id: foreign, email: "foreign@example.test" }], ["invalid", { id: tenant, email: "invalid" }],
  ] as const) {
    test(`${label} owner contact has an explicit safe unavailable state`, async () => {
      customer = null; authUser = value
      assert.deepEqual(await fresh(), core.emptyTrialContact())
    })
  }
  test("auth provider failure is unavailable without logging PII", async () => {
    const log = mock.method(console, "error", () => assert.fail("must not log provider error/PII"))
    try {
      customer = null; ownerError = new Error("private owner@example.test")
      assert.deepEqual(await fresh(), core.emptyTrialContact())
    } finally { log.mock.restore() }
  })
  test("ignores debtor, sender, reply-to, display-name and auth metadata properties", async () => {
    db.profile = { ...db.profile, displayName: "Not Billing Name", clientEmail: "debtor@example.test", fromEmail: "sender@example.test", replyTo: "reply@example.test" }
    customer = { ...customer!, email: null, clientEmail: "debtor@example.test", fromEmail: "sender@example.test" } as TrialContactCustomer
    authUser = { id: tenant, email: null, user_metadata: { email: "metadata@example.test", name: "Not Billing" } } as TrialContactOwner
    assert.deepEqual(await service.resolve(tenant), core.emptyTrialContact())
  })
  test("default Supabase adapter uses canonical URL, server secret and minimal owner lookup", async () => {
    const old = process.env.SUPABASE_SECRET_KEY
    process.env.SUPABASE_SECRET_KEY = "unit-test-only-secret"
    try {
      customer = null
      const defaults = api.createTrialAccessContactService()
      assert.deepEqual(await defaults.resolve(tenant), fallback)
      assert.deepEqual(clientOptions, ["https://example.test", "unit-test-only-secret", { auth: { autoRefreshToken: false, persistSession: false } }])
      sdkError = { message: "private owner@example.test" }
      assert.deepEqual(await defaults.resolve(tenant), core.emptyTrialContact())
    } finally {
      if (old === undefined) delete process.env.SUPABASE_SECRET_KEY
      else process.env.SUPABASE_SECRET_KEY = old
    }
  })
})

describe("recipient freezing on the existing notification outbox", () => {
  test("freezes once with an atomic pending/undispatched/null-evidence predicate", async () => {
    const original = structuredClone(db.row)
    const result = await service.freeze(tenant, operationId)
    assert.deepEqual(result, { outcome: "frozen", status: "pending", contact: billing, failureCode: null })
    assert.equal(db.writes.length, 1)
    const where = db.writes[0].where!
    for (const key of ["recipientEmail", "recipientName", "contactSource", "firstAttemptAt", "lastAttemptAt", "sentAt", "providerMessageId", "leaseOwner", "leaseExpiresAt"]) {
      assert.equal((where as Row)[key], null)
    }
    assert.equal(where.status, "pending"); assert.equal(where.attempts, 0); assert.equal(where.fencingToken, 0)
    assert.ok(where.renderedPayload)
    assert.deepEqual(db.writes[0].data, { recipientEmail: billing.email, recipientName: billing.name, contactSource: billing.source })
    assert.deepEqual({ ...db.row, recipientEmail: null, recipientName: null, contactSource: null }, original)
  })
  test("missing name freezes null without using a debtor/owner/display name", async () => {
    customer!.name = null
    const result = await service.freeze(tenant, operationId)
    assert.equal(result.contact.nameMissing, true); assert.equal(db.row.recipientName, null)
    assert.equal(db.row.contactSource, "stripe_billing")
  })
  test("changed Stripe and owner addresses never change a frozen retry recipient", async () => {
    await service.freeze(tenant, operationId)
    const frozen = structuredClone(db.row)
    customer!.email = "new-billing@example.test"; authUser!.email = "new-owner@example.test"
    db.profile!.stripeCustomerId = "cus_changed"
    db.row.status = "failed"; db.row.attempts = 1; db.row.firstAttemptAt = instant
    assert.deepEqual((await service.freeze(tenant, operationId)).contact, billing)
    assert.deepEqual(customerReads, ["cus_billing"]); assert.deepEqual(ownerReads, [])
    assert.equal(db.writes.length, 1); assert.equal(db.row.providerIdempotencyKey, frozen.providerIdempotencyKey)
  })
  test("fallback recipient is also immutable when Stripe later gains an email", async () => {
    customer!.email = null
    await service.freeze(tenant, operationId)
    customer!.email = "now-billing@example.test"; authUser!.email = "new-owner@example.test"
    assert.deepEqual((await service.freeze(tenant, operationId)).contact, fallback)
    assert.equal(customerReads.length, 1); assert.equal(ownerReads.length, 1)
  })
  test("missing contact blocks only communication, without changing the succeeded operation", async () => {
    customer = null; authUser = null
    const op = structuredClone(db.operation), profile = structuredClone(db.profile)
    const result = await service.freeze(tenant, operationId)
    assert.equal(result.status, "blocked"); assert.equal(result.failureCode, "trial_notification_contact_unavailable")
    assert.deepEqual(result.contact, core.emptyTrialContact())
    assert.deepEqual(db.operation, op); assert.deepEqual(db.profile, profile)
    assert.equal(db.row.attempts, 0); assert.equal(db.row.firstAttemptAt, null)
    assert.deepEqual(Object.keys(db.writes[0].data).sort(), ["failureCode", "failureSummary", "status"])
    authUser = { id: tenant, email: "late@example.test" }
    await service.freeze(tenant, operationId)
    assert.equal(ownerReads.length, 1, "blocked record is not silently reinitialized")
  })
  test("concurrent initializers use one durable recipient", async () => {
    const results = await Promise.all([service.freeze(tenant, operationId), service.freeze(tenant, operationId)])
    assert.deepEqual(results.map((r) => r.outcome), ["frozen", "unchanged"])
    assert.deepEqual(results[0].contact, results[1].contact)
    assert.equal(db.writes.length, 1); assert.equal(customerReads.length, 1)
  })
  test("lost conditional update returns the stored winner, never the losing address", async () => {
    db.casLoss = () => { Object.assign(db.row, { recipientEmail: "winner@example.test", recipientName: null, contactSource: "owner_fallback" }) }
    const result = await service.freeze(tenant, operationId)
    assert.equal(result.outcome, "unchanged"); assert.equal(result.contact.email, "winner@example.test")
  })
  test("supersession during resolution cannot be overwritten by freezing", async () => {
    db.casLoss = () => { db.row.status = "superseded" }
    const result = await service.freeze(tenant, operationId)
    assert.equal(result.status, "superseded"); assert.equal(result.contact.email, null)
  })
  for (const [field, value] of [
    ["status", "sent"], ["status", "unknown"], ["status", "sending"], ["status", "failed"], ["status", "not_requested"],
    ["status", "superseded"], ["attempts", 1], ["firstAttemptAt", instant], ["lastAttemptAt", instant],
    ["sentAt", instant], ["providerMessageId", "message"], ["renderedPayload", { subject: "frozen" }],
    ["leaseOwner", "executor"], ["leaseExpiresAt", instant], ["fencingToken", 1], ["contactSource", "owner_fallback"],
  ] as const) {
    test(`does not resolve or rewrite existing ${field}=${String(value)}`, async () => {
      Object.assign(db.row, { [field]: value })
      const original = structuredClone(db.row)
      assert.equal((await service.freeze(tenant, operationId)).outcome, "unchanged")
      assert.deepEqual(db.row, original); assert.deepEqual(customerReads, []); assert.deepEqual(ownerReads, [])
      assert.equal(db.writes.length, 0)
    })
  }
  for (const patch of [{ role: "platform_support" }, { role: "platform_admin" }, { status: "disabled" }]) {
    test(`denies invalid current owner authority ${JSON.stringify(patch)} before reads`, async () => {
      Object.assign(owner.platformRole, patch)
      await assert.rejects(service.freeze(tenant, operationId), { code: "trial_owner_required", status: 403 })
      assert.equal(db.reads, 0); assert.equal(customerReads.length, 0)
    })
  }
  test("auth guard failure propagates before any target lookup", async () => {
    authError = new Error("unauthenticated")
    await assert.rejects(service.freeze(tenant, operationId), authError)
    assert.equal(authorizeCalls, 1)
    assert.equal(db.reads, 0)
  })
  for (const patch of [{ actorUserId: "other-owner" }, { adminSessionId: "new-session" }, { userId: foreign }, { status: "pending" }, { notify: false }]) {
    test(`scoped absence for operation ${JSON.stringify(patch)} without providers`, async () => {
      Object.assign(db.operation, patch)
      await assert.rejects(service.freeze(tenant, operationId), { code: "trial_notification_not_found", status: 404 })
      assert.equal(db.writes.length, 0); assert.deepEqual(customerReads, []); assert.deepEqual(ownerReads, [])
    })
  }
  test("foreign tenant and operation IDs disclose no contact", async () => {
    await assert.rejects(service.freeze(foreign, operationId), { status: 404 })
    await assert.rejects(service.freeze(tenant, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), { status: 404 })
    assert.deepEqual(customerReads, []); assert.deepEqual(ownerReads, [])
  })
  test("expired elevation after provider reads prevents persistence", async () => {
    readHook = () => { owner.adminSession.expiresAt = instant }
    await assert.rejects(service.freeze(tenant, operationId), { code: "trial_owner_required", status: 403 })
    assert.equal(db.writes.length, 0)
  })
  test("persistence failure returns only a safe code and leaves recipient uncommitted", async () => {
    db.fault = true
    await assert.rejects(service.freeze(tenant, operationId), { code: "trial_contact_unavailable", message: "trial_contact_unavailable", status: 503 })
    assert.equal(db.row.recipientEmail, null)
  })
  test("implementation is server-only and has no sender, eligibility or access mutation seam", () => {
    for (const path of ["lib/email/trialAccessContact.ts", "lib/email/trialAccessContactService.ts"]) {
      const source = readFileSync(path, "utf8")
      assert.match(source, /import "server-only"/)
      assert.doesNotMatch(source, /resend|sendFollowUpEmail|emailSettings\.|financialContact\.|trackedInvoice\.|resolveTrialEligibility|tenantTrialGrant\.(?:update|create)|userProfile\.update|tenantTrialOperation\.update/)
    }
  })
})