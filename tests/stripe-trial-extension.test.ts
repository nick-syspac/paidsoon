import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { AsyncLocalStorage } from "node:async_hooks"
import type Stripe from "stripe"
import type { AdminGuardContext } from "@/lib/admin/guard"
import type { Prisma } from "@/lib/generated/prisma/client"
import { WebhookLedgerMock } from "@/tests/helpers/webhookLedgerMock"
import StripeSDK from "stripe"

type Row = Record<string, unknown>
const tenant = "11111111-1111-4111-8111-111111111111"
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const start = new Date("2026-10-16T00:00:00Z")
const request = { ipAddress: "127.0.0.1", userAgent: "test", requestId: "request-1" }
const transactionContext = new AsyncLocalStorage<boolean>()
let api: typeof import("@/lib/billing/stripeTrialExtension")
let previewsApi: typeof import("@/lib/billing/trialAccessPreview")
let recoveryApi: typeof import("@/lib/billing/stripeTrialRecovery")
let coordinatorApi: typeof import("@/lib/billing/tenantBillingCoordinator")
let route: typeof import("@/app/api/webhooks/stripe-billing/route")
let hostedApi: typeof import("@/lib/billing/hostedCheckoutLifecycle")
let recovery: ReturnType<typeof recoveryApi.createStripeTrialRecoveryService>
let ledger: WebhookLedgerMock
let newSubscription: Row | undefined
let checkoutSession: Row | undefined
let delayedResponse: (() => Promise<void>) | undefined
let service: ReturnType<typeof api.createStripeTrialExtensionService>
let previews: ReturnType<typeof previewsApi.createTrialAccessPreviewService>
let db: Database, owner: AdminGuardContext, time: Date, subscription: Row
let calls: Row[], reads: number, authCalls: number
let providerError: unknown, afterCall: (() => void) | undefined, beforeReturn: (() => void) | undefined
let notificationError: boolean

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("path" in value && "equals" in value) return (row[key] as Row)?.[(value.path as string[])[0]] === value.equals
      if ("in" in value) return (value.in as unknown[]).includes(row[key])
      if ("gt" in value) return row[key] instanceof Date && row[key] > (value.gt as Date)
      return !!row[key] && matches(row[key] as Row, value as Row)
    }
    return row[key] instanceof Date && value instanceof Date ? row[key].getTime() === value.getTime() : row[key] === value
  })
}
class Database {
  profile: Row = { userId: tenant, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", stripePriceId: "price_control",
    subscriptionStatus: "trialing", subscriptionTier: "business_control", trialEndsAt: new Date("2026-10-21"),
    billingAccessVersion: 7, pendingTrialOperationId: null, pendingBillingMutationId: null,
    subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null, subscriptionCancelAt: null,
    subscriptionCancelAtPeriodEnd: false, stripeScheduleId: null, pendingDowngradeTier: null }
  operations: Row[] = []; audits: Row[] = []; grants: Row[] = []; notifications: Row[] = []; risks: Row[] = []
  customerOperations: Row[] = []; customerSteps: Row[] = []
  locked = false; transactions = 0; writes: string[] = []; fault: string | null = null
  auditHook: (() => void) | undefined
  commitHook: (() => void) | undefined
  private tail = Promise.resolve()
  snapshot(): Row { return structuredClone({ profile: this.profile, operations: this.operations, audits: this.audits,
    grants: this.grants, notifications: this.notifications, risks: this.risks,
    customerOperations: this.customerOperations, customerSteps: this.customerSteps }) }
  delegate(name: string, rows: () => Row[]) {
    const write = (action: string, data: Row) => {
      assert.ok(this.locked)
      const label = `${name}.${action}`; this.writes.push(label)
      const subtype = (data.metadata as Row | undefined)?.action
      if (this.fault === label || this.fault === `audit.${subtype}`) throw new Error("private DB error")
      if (name === "grant") assert.fail("Stripe extension must never mutate grants")
      if (name === "notification" && action === "create") assert.ok(this.audits.some((row) =>
        (row.metadata as Row).action === "trial_result" && ((row.metadata as Row).result as Row).status === "succeeded"))
    }
    const apply = (row: Row, data: Row): Row => {
      for (const [key, value] of Object.entries(structuredClone(data))) row[key] = value && typeof value === "object" && "increment" in value
        ? Number(row[key]) + Number(value.increment) : value
      return structuredClone(row)
    }
    return {
      findFirst: async ({ where }: { where: Row }) => {
        assert.ok(this.locked)
        return structuredClone(rows().find((r) => matches(r, where)) ?? null)
      },
      findUnique: async ({ where }: { where: Row }) => { assert.ok(this.locked); return structuredClone(rows().find((r) => matches(r, where)) ?? null) },
      findMany: async ({ where }: { where: Row }) => { assert.ok(this.locked); return structuredClone(rows().filter((r) => matches(r, where))) },
      create: async ({ data }: { data: Row }) => {
        write("create", data)
        const row = { result: null, attempts: 0, fencingToken: 0, firstAttemptAt: null, leaseOwner: null, leaseExpiresAt: null, ...structuredClone(data) }
        rows().push(row); if (name === "audit") this.auditHook?.()
        return structuredClone(row)
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        write("update", data); const row = rows().find((r) => matches(r, where)); assert.ok(row); return apply(row, data)
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        write("updateMany", data)
        const found = rows().filter((r) => matches(r, where)); found.forEach((r) => apply(r, data)); return { count: found.length }
      },
      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        write("upsert", update)
        const composite = where.kind_stripeObjectId as Row
        const found = rows().find((r) => matches(r, composite))
        if (found) return apply(found, update)
        rows().push(structuredClone(create)); return create
      },
    }
  }
  transaction = async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    const previous = this.tail; let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve }); await previous
    this.transactions++; const original = this.snapshot(), ledgerRows = structuredClone(ledger.rows)
    const tx = {
      $executeRawUnsafe: async (sql: string, key: string) => {
        assert.equal(sql, "SELECT pg_advisory_xact_lock(hashtext($1))"); assert.equal(key, `billing-access:${tenant}`); this.locked = true
      },
      userProfile: this.delegate("profile", () => [this.profile]),
      tenantTrialOperation: this.delegate("operation", () => this.operations),
      tenantTrialGrant: this.delegate("grant", () => this.grants),
      tenantTrialNotification: this.delegate("notification", () => this.notifications),
      tenantBillingRisk: this.delegate("risk", () => this.risks),
      tenantBillingMutation: this.delegate("customer", () => this.customerOperations),
      tenantBillingMutationStep: { findUnique: async ({ where }: { where: { userId_mutationId_stepKey: Row } }) =>
        structuredClone(this.customerSteps.find((r) => matches(r, where.userId_mutationId_stepKey)) ?? null) },
      adminAuditEvent: this.delegate("audit", () => this.audits),
      stripeBillingWebhookEvent: ledger.delegate,
    }
    try {
      const result = await transactionContext.run(true, () => run(tx as unknown as Prisma.TransactionClient))
      if (this.fault === "commit" || (this.fault === "acceptance_commit" && this.profile.pendingTrialOperationId)) throw new Error("private commit failure")
      this.commitHook?.(); return result
    } catch (error) { Object.assign(this, original); ledger.rows = ledgerRows; throw error }
    finally { this.locked = false; release() }
  }
}
function provider(): Stripe {
  const read = () => { assert.ok(db.locked, "all provider observations hold tenant lock"); reads++ }
  return {
    webhooks: signing.webhooks,
    checkout: { sessions: { retrieve: async () => structuredClone(checkoutSession) } },
    customers: { retrieve: async () => { read(); return { id: "cus_1", metadata: {} } } },
    subscriptions: {
      list: async () => { read(); return { data: [structuredClone(subscription), ...(newSubscription ? [structuredClone(newSubscription)] : [])], has_more: false } },
      retrieve: async (sid: string) => { if (db.locked) read(); return structuredClone(sid === newSubscription?.id ? newSubscription : subscription) },
      update: async (subscriptionId: string, params: Row, options: Row) => {
        assert.notEqual(transactionContext.getStore(), true, "dispatching caller holds no transaction across provider mutation")
        assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.profile.pendingBillingMutationId, null)
        assert.equal(db.operations[0].status, "pending"); assert.ok(Number(db.operations[0].attempts) >= 1)
        assert.deepEqual(db.operations[0].firstAttemptAt, calls.length ? start : time)
        assert.ok(db.audits.length >= 1, "attempt AUDIT committed before dispatch")
        if (calls.length) assert.equal((db.audits.at(-1)!.metadata as Row).action, "trial_recovery")
        assert.equal((db.audits[0].metadata as Row).action, "trial_attempt")
        if (!calls.length) assert.equal(db.profile.billingAccessVersion, 8)
        else assert.ok(Number(db.profile.billingAccessVersion) >= 8)
        calls.push(structuredClone({ subscriptionId, params, options }))
        if (providerError) throw providerError
        subscription.trial_end = params.trial_end
        const response = structuredClone({ ...subscription, latest_invoice: "in_response", lastResponse: { requestId: "req_1" } })
        afterCall?.(); await delayedResponse?.(); beforeReturn?.(); return response
      },
    },
    invoices: { list: async () => { read(); return { data: [], has_more: false } } },
    invoicePayments: { list: async () => { read(); return { data: [], has_more: false } } },
    charges: { list: async () => { read(); return { data: [], has_more: false } } },
  } as unknown as Stripe
}
function setup(): void {
  db = new Database(); time = new Date(start); reads = 0; calls = []; authCalls = 0
  providerError = undefined; afterCall = undefined; beforeReturn = undefined
  notificationError = false
  newSubscription = undefined; checkoutSession = undefined; delayedResponse = undefined; ledger = new WebhookLedgerMock()
  owner = { userId: "owner-1", userEmail: "owner@example.test", platformRole: { userId: "owner-1", role: "platform_owner", status: "active" },
    adminSession: { id: "session-1", userId: "owner-1", adminDeviceId: "device-1", revokedAt: null, expiresAt: new Date("2027-01-01") } } as AdminGuardContext
  subscription = { id: "sub_1", customer: "cus_1", metadata: {}, status: "trialing",
    items: { has_more: false, data: [{ quantity: 1, price: { id: "price_control", type: "recurring", recurring: { usage_type: "licensed" } } }] },
    trial_start: start.getTime() / 1000, trial_end: Date.parse("2026-10-21") / 1000, billing_cycle_anchor: start.getTime() / 1000,
    latest_invoice: null, cancel_at: null, cancel_at_period_end: false, schedule: null, pending_update: null, pause_collection: null,
    pending_invoice_item_interval: null, next_pending_invoice_item_invoice: null }
  const deps = { transaction: db.transaction, authorize: async () => { authCalls++; return owner }, now: () => time, stripe: provider,
    notify: async () => { assert.equal(transactionContext.getStore(), undefined); assert.equal(db.operations[0]?.status, "succeeded");
      if (notificationError) throw new Error("mandatory delivery audit unavailable")
      return undefined } }
  service = api.createStripeTrialExtensionService(deps); previews = previewsApi.createTrialAccessPreviewService(deps)
  recovery = recoveryApi.createStripeTrialRecoveryService(deps)
}
const signing = new StripeSDK("sk_test_dummy", { apiVersion: "2026-05-27.dahlia" })
const preview = (overrides: Row = {}) => previews.preview(tenant, { operationId: id, action: "extend_or_grant", days: 7,
  reason: "Approved extension", timeZone: "UTC", expectedVersion: 7, ...overrides })
const confirm = () => service.confirm(tenant, { operationId: id, expectedVersion: 7 }, request)
const recover = () => recovery.reconcile(tenant, id, {}, request)
function expireLease(): void { time = new Date(start.getTime() + 61000) }
async function uncertain(notify = true): Promise<void> {
  await preview({ notify }); providerError = new Error("timeout"); await confirm(); providerError = undefined; expireLease()
}
const reject = (run: () => Promise<unknown>, code?: string) => assert.rejects(run, (e: unknown) =>
  e instanceof Error && (!code || ("code" in e && e.code === code)))
const validationError = () => ({ type: "StripeInvalidRequestError", statusCode: 400, code: "parameter_invalid_integer",
  raw: { type: "invalid_request_error" }, message: "private provider data" })

before(async () => {
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
    $transaction: <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => db.transaction(run),
    stripeBillingWebhookEvent: {
      create: (args: Parameters<typeof ledger.delegate.create>[0]) => ledger.delegate.create(args),
      updateMany: (args: Parameters<typeof ledger.delegate.updateMany>[0]) => ledger.delegate.updateMany(args),
      findUnique: (args: Parameters<typeof ledger.delegate.findUnique>[0]) => ledger.delegate.findUnique(args),
    },
    userProfile: { findUnique: async () => structuredClone(db.profile), findFirst: async () => structuredClone(db.profile) },
  } } })
  mock.module("@/lib/admin/guard", { namedExports: { requireAdminElevation: async (options: { minRole?: string }) => {
    assert.deepEqual(options, { minRole: "platform_owner" }, "default service must never use the generic staff guard")
    authCalls++; return owner
  } } })
  mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: provider } })
  process.env.STRIPE_SOLO_PRICE_ID = "price_control"
  api = await import("@/lib/billing/stripeTrialExtension"); previewsApi = await import("@/lib/billing/trialAccessPreview")
  recoveryApi = await import("@/lib/billing/stripeTrialRecovery")
  coordinatorApi = await import("@/lib/billing/tenantBillingCoordinator")
  hostedApi = await import("@/lib/billing/hostedCheckoutLifecycle")
  route = await import("@/app/api/webhooks/stripe-billing/route")
})

describe("Stripe owner uncertain-outcome recovery — task 4.5", () => {
  test("timeout recovers exact frozen request/key once after monotonic lease reclaim", async () => {
    await uncertain(); const old = structuredClone(db.operations[0]), audits = structuredClone(db.audits)
    assert.equal((await recover()).status, "succeeded")
    assert.deepEqual(calls[1], calls[0]); assert.equal(db.operations[0].fencingToken, 2)
    assert.equal(db.operations[0].attempts, 2); assert.deepEqual(db.operations[0].firstAttemptAt, old.firstAttemptAt)
    assert.equal(db.operations[0].stripeIdempotencyKey, old.stripeIdempotencyKey)
    assert.deepEqual(db.audits.slice(0, 2), audits); assert.equal(db.notifications.length, 1)
    assert.equal(db.profile.pendingTrialOperationId, null)
    const done = db.snapshot(), count = reads
    assert.deepEqual(await recover(), db.operations[0].result); assert.equal(reads, count); assert.equal(calls.length, 2)
    assert.deepEqual(db.snapshot(), done)
  })
  test("same original actor can status/recover under new elevation; original journal and earlier audit immutable", async () => {
    await uncertain(); const original = structuredClone(db.audits)
    owner.adminSession.id = "session-2"
    const state = await recovery.status(tenant, id)
    assert.equal(state.reconciliationRequired, true)
    assert.equal((await recover()).status, "succeeded"); assert.equal(db.operations[0].adminSessionId, "session-1")
    assert.deepEqual(db.audits.slice(0, original.length), original)
    const recovered = db.audits.find((r) => (r.metadata as Row).action === "trial_recovery")!
    assert.equal(recovered.adminSessionId, "session-2")
    assert.equal((recovered.metadata as Row).originalSessionId, "session-1")
    assert.equal((recovered.metadata as Row).recoveringSessionId, "session-2")
    assert.ok(!JSON.stringify(state).includes("session-") && !JSON.stringify(state).includes("trial-extension/"))
  })
  test("same-session recovery still records both session identities", async () => {
    await uncertain(); await recover()
    const a = db.audits.find((r) => (r.metadata as Row).action === "trial_recovery")!
    assert.equal((a.metadata as Row).originalSessionId, "session-1"); assert.equal((a.metadata as Row).recoveringSessionId, "session-1")
  })
  for (const invalid of ["other_actor", "other_tenant", "missing", "support", "disabled", "expired", "revoked"]) {
    test(`status and recovery deny ${invalid} before provider observations/mutation`, async () => {
      await uncertain(); const count = reads, updates = calls.length, before = db.snapshot()
      if (invalid === "other_actor") { owner.userId = "owner-2"; owner.platformRole.userId = "owner-2"; owner.adminSession.userId = "owner-2" }
      if (invalid === "support") owner.platformRole.role = "platform_support"
      if (invalid === "disabled") owner.platformRole.status = "disabled"
      if (invalid === "expired") owner.adminSession.expiresAt = new Date(start)
      if (invalid === "revoked") owner.adminSession.revokedAt = new Date(start)
      const target = invalid === "other_tenant" ? "foreign" : tenant, op = invalid === "missing" ? other : id
      await reject(() => recovery.status(target, op)); await reject(() => recovery.reconcile(target, op, {}, request))
      assert.equal(reads, count); assert.equal(calls.length, updates); assert.deepEqual(db.snapshot(), before)
    })
  }
  test("new session cannot confirm old preview and recovery cannot execute unconfirmed preview", async () => {
    await preview(); owner.adminSession.id = "session-2"
    await reject(confirm, "trial_operation_not_found"); await reject(recover)
    assert.equal(calls.length, 0); assert.equal(db.audits.length, 0); assert.equal(db.profile.pendingTrialOperationId, null)
  })
  test("recovery rejects replacement parameters and preserves original intent", async () => {
    await uncertain(); const before = db.snapshot()
    await reject(() => recovery.reconcile(tenant, id, { trial_end: 999, idempotencyKey: "other" }, request))
    assert.deepEqual(db.snapshot(), before); assert.equal(calls.length, 1)
  })
  test("live lease is busy; expiry alone preserves both reservation protection and first attempt", async () => {
    await uncertain(); time = new Date(start.getTime() + 59000)
    const before = db.snapshot(); assert.equal((await recover()).status, "reconciliation_required")
    assert.deepEqual(db.snapshot(), before); assert.equal(calls.length, 1)
    expireLease(); assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal((await recover()).status, "succeeded")
  })
  test("recovery attempt audit failure prevents all replay and rolls back lease/fence claim", async () => {
    await uncertain(); const before = db.snapshot(); db.fault = "audit.trial_recovery"
    await reject(recover); assert.deepEqual(db.snapshot(), before); assert.equal(calls.length, 1)
  })
  test("recovery acceptance commit failure prevents all replay", async () => {
    await uncertain(); const before = db.snapshot(); db.fault = "commit"
    await reject(recover); assert.deepEqual(db.snapshot(), before); assert.equal(calls.length, 1)
  })
  test("cached provider 500 stays reserved after one explicit attempt, no fallback/new key", async () => {
    await uncertain(); providerError = { type: "StripeAPIError", statusCode: 500 }
    assert.equal((await recover()).status, "reconciliation_required"); assert.equal(calls.length, 2)
    assert.deepEqual(calls[1], calls[0]); assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal(db.notifications.length, 0); assert.equal(db.grants.length, 0)
  })
  test("cached 500 with already-matching current date still cannot be treated as success", async () => {
    await uncertain(); subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
    providerError = { type: "StripeAPIError", statusCode: 500 }
    assert.equal((await recover()).status, "reconciliation_required"); assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal(db.notifications.length, 0); assert.equal(calls.length, 2)
  })
  test("success followed by DB failure recovers within retention without duplicate success/outbox", async () => {
    await preview({ notify: true }); afterCall = () => { db.fault = "notification.create" }
    assert.equal((await confirm()).status, "reconciliation_required")
    db.fault = null; afterCall = undefined; expireLease()
    assert.equal((await recover()).status, "succeeded"); assert.deepEqual(calls[1], calls[0])
    assert.equal(db.notifications.length, 1)
    assert.equal(db.audits.filter((a) => ((a.metadata as Row).result as Row).status === "succeeded").length, 1)
  })
  for (const offset of [86400000, 86400001, 2 * 86400000]) {
    test(`unknown at/after retention ${offset} never reposts despite matching current target`, async () => {
      await uncertain(); subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
      time = new Date(start.getTime() + offset)
      assert.equal((await recover()).status, "reconciliation_required"); assert.equal(calls.length, 1)
      assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0)
    })
  }
  test("one millisecond before retention may replay exact key", async () => {
    await uncertain(); time = new Date(start.getTime() + 86400000 - 1)
    assert.equal((await recover()).status, "succeeded"); assert.deepEqual(calls[1], calls[0])
  })
  test("recovery commit crossing retention cannot dispatch", async () => {
    await uncertain(); time = new Date(start.getTime() + 86400000 - 1)
    db.commitHook = () => { time = new Date(start.getTime() + 86400000) }
    assert.equal((await recover()).status, "reconciliation_required"); assert.equal(calls.length, 1)
  })
  test("recovery audit crossing lease cannot dispatch/clear", async () => {
    await uncertain(); db.auditHook = () => { time = new Date(time.getTime() + 61000) }
    await reject(recover); assert.equal(calls.length, 1); assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal(db.operations[0].fencingToken, 1)
  })
  test("recovery commit crossing execution lease cannot dispatch or release", async () => {
    await uncertain(); db.commitHook = () => { time = new Date(time.getTime() + 61000) }
    assert.equal((await recover()).status, "reconciliation_required"); assert.equal(calls.length, 1)
    assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0)
  })
  test("legacy task-4.4 durable exact response proof supports late recovery without repost", async () => {
    await preview(); afterCall = () => { subscription.status = "active"; subscription.trial_end = null }
    await confirm(); afterCall = undefined
    const p = db.operations[0].providerResult as Row
    db.operations[0].providerResult = { subscriptionId: p.subscriptionId, trialEnd: p.trialEnd, priceId: p.priceId,
      key: p.key, firstAttemptAt: p.firstAttemptAt, outcome: "succeeded" }
    time = new Date(start.getTime() + 2 * 86400000)
    assert.equal((await recover()).status, "superseded"); assert.equal(calls.length, 1)
    assert.equal(db.profile.subscriptionStatus, "active"); assert.equal(db.profile.pendingTrialOperationId, null)
  })
  for (const corruption of ["key", "trialEnd", "operationId", "firstAttemptAt", "priceId"]) {
    test(`corrupt durable ${corruption} cannot prove a late outcome`, async () => {
      await preview(); afterCall = () => { subscription.status = "active"; subscription.trial_end = null }; await confirm(); afterCall = undefined
      const proof = db.operations[0].providerResult as Row; proof[corruption] = corruption === "trialEnd" ? 1 : "wrong"
      time = new Date(start.getTime() + 2 * 86400000)
      assert.equal((await recover()).status, "reconciliation_required"); assert.equal(calls.length, 1)
      assert.equal(db.profile.pendingTrialOperationId, id)
    })
  }
  for (const state of ["active", "canceled", "past_due"]) {
    test(`unknown original outcome plus newer ${state} is not supersession or permission to replay`, async () => {
      await uncertain(); subscription.status = state; subscription.trial_end = null
      assert.equal((await recover()).status, "reconciliation_required"); assert.equal(calls.length, 1)
      assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0)
      assert.equal(db.profile.subscriptionStatus, state)
    })
    test(`durable original success plus newer ${state} finalizes proven supersession without stale expiry`, async () => {
      await preview({ notify: true }); afterCall = () => { subscription.status = state; subscription.trial_end = null }
      assert.equal((await confirm()).status, "reconciliation_required"); afterCall = undefined; expireLease()
      const result = await recover(); assert.equal(result.status, "superseded"); assert.equal(calls.length, 1)
      assert.equal(db.profile.subscriptionStatus, state); assert.equal(db.profile.trialEndsAt, null)
      assert.equal(db.profile.pendingTrialOperationId, null); assert.equal(db.notifications.length, 0)
      assert.equal(db.operations[0].status, "succeeded"); assert.ok(!("targetExpiresAt" in result))
    })
  }
  test("competing recoveries claim once, result/outbox exactly once", async () => {
    await uncertain(); const result = await Promise.all([recover(), recover()])
    assert.ok(result.some((r) => r.status === "succeeded")); assert.equal(calls.length, 2)
    assert.equal(db.notifications.length, 1); assert.equal(db.operations[0].fencingToken, 2)
  })
  for (const fault of ["audit.trial_result", "notification.create", "profile.update", "operation.update"]) {
    test(`recovery ${fault} after Stripe success stays recoverable with exactly one eventual result`, async () => {
      await uncertain(); afterCall = () => { db.fault = fault }
      assert.equal((await recover()).status, "reconciliation_required")
      assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0)
      db.fault = null; afterCall = undefined; time = new Date(time.getTime() + 61000)
      assert.equal((await recover()).status, "succeeded"); assert.equal(db.notifications.length, 1)
      assert.equal(db.audits.filter((a) => ((a.metadata as Row).result as Row).status === "succeeded").length, 1)
      assert.deepEqual(calls[2], calls[0]); assert.equal(db.operations[0].fencingToken, 3)
    })
  }
  test("stale original executor cannot finalize after recovery takes over", async () => {
    await preview({ notify: true })
    let release!: () => void, reached!: () => void
    const gate = new Promise<void>((r) => { release = r }), entered = new Promise<void>((r) => { reached = r })
    delayedResponse = async () => { reached(); await gate }
    const original = confirm(); await entered; delayedResponse = undefined; expireLease()
    assert.equal((await recover()).status, "succeeded"); release()
    assert.equal((await original).status, "reconciliation_required")
    assert.equal(db.notifications.length, 1); assert.equal(db.profile.pendingTrialOperationId, null)
    assert.equal(db.operations[0].fencingToken, 2)
  })
  test("customer reservation cannot be bypassed or cleared by owner recovery", async () => {
    await uncertain(); db.profile.pendingBillingMutationId = other
    const before = db.snapshot(); await reject(recover); assert.deepEqual(db.snapshot(), before); assert.equal(calls.length, 1)
  })
})

async function signedUpdate(overrides: Row = {}, delivered?: Row): Promise<Response> {
  const op = db.operations[0]
  const object = delivered ?? { ...structuredClone(subscription), trial_end: (op.targetExpiresAt as Date).getTime() / 1000 }
  const event = { id: "evt_trial", created: Math.floor(start.getTime() / 1000) + 1, type: "customer.subscription.updated",
    request: { id: "req_original", idempotency_key: op.stripeIdempotencyKey }, data: { object }, ...overrides }
  const body = JSON.stringify(event), secret = "whsec_dummy_trial"
  process.env.STRIPE_BILLING_WEBHOOK_SECRET = secret
  return route.POST(new Request("http://localhost/api/webhooks/stripe-billing", { method: "POST", body,
    headers: { "stripe-signature": signing.webhooks.generateTestHeaderString({ payload: body, secret }) } }))
}

describe("signed owner webhook-assisted finalization — task 4.5", () => {
  test("signed exact operation proof finalizes atomically with fresh truth and terminal ledger; duplicate no-op", async () => {
    await uncertain(); subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
    const res = await signedUpdate(); assert.equal(res.status, 200)
    assert.equal(db.profile.pendingTrialOperationId, null); assert.equal(db.operations[0].status, "succeeded")
    assert.equal(db.notifications.length, 1); assert.equal(ledger.rows.get("evt_trial")?.processingStatus, "processed")
    assert.equal(calls.length, 1)
    const before = db.snapshot(); assert.equal((await signedUpdate()).status, 200); assert.deepEqual(db.snapshot(), before)
  })
  for (const request of [null, { id: null, idempotency_key: "foreign" }, { id: "unattributed" }, { id: null }]) {
    test(`matching target/status/timestamp without operation attribution ${JSON.stringify(request)} never clears owner`, async () => {
      await uncertain(); subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
      assert.equal((await signedUpdate({ request })).status, 200)
      assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0)
      time = new Date(start.getTime() + 2 * 86400000)
      assert.equal((await recover()).status, "reconciliation_required"); assert.equal(calls.length, 1)
    })
  }
  test("stored provider request ID can attribute signed event without key; mismatched delivered target cannot", async () => {
    await uncertain(); db.operations[0].stripeRequestId = "req_known"
    subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
    assert.equal((await signedUpdate({ request: { id: "req_known", idempotency_key: null } })).status, 200)
    assert.equal(db.profile.pendingTrialOperationId, null)
  })
  test("attributed event with wrong target does not prove original outcome", async () => {
    await uncertain()
    assert.equal((await signedUpdate({}, { ...subscription, trial_end: 1234567890 })).status, 200)
    assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0)
  })
  test("signed delivered proof is separate from newer paid current truth, even after key retention", async () => {
    await uncertain(); const delivered = { ...structuredClone(subscription), trial_end: (db.operations[0].targetExpiresAt as Date).getTime() / 1000 }
    subscription.status = "active"; subscription.trial_end = null
    assert.equal((await signedUpdate({}, delivered)).status, 200)
    assert.equal((db.operations[0].result as Row).status, "superseded")
    assert.equal(db.profile.subscriptionStatus, "active"); assert.equal(db.profile.trialEndsAt, null)
    assert.equal(db.notifications.length, 0); assert.equal(db.profile.pendingTrialOperationId, null)
  })
  test("signed proof under live owner lease is durable evidence, not lease theft; late recovery never reposts", async () => {
    await uncertain(); db.operations[0].leaseExpiresAt = new Date("2100-01-01")
    subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
    assert.equal((await signedUpdate()).status, 200)
    assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.operations[0].fencingToken, 1)
    assert.ok(db.operations[0].providerResult)
    db.operations[0].leaseExpiresAt = new Date(start); time = new Date(start.getTime() + 2 * 86400000)
    assert.equal((await recover()).status, "succeeded"); assert.equal(calls.length, 1); assert.equal(db.notifications.length, 1)
  })
  test("missing current configuration cannot be relabeled proven supersession", async () => {
    await uncertain(); db.operations[0].leaseExpiresAt = new Date("2100-01-01")
    subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
    assert.equal((await signedUpdate()).status, 200)
    delete subscription.pending_update
    db.operations[0].leaseExpiresAt = new Date(start); time = new Date(start.getTime() + 2 * 86400000)
    assert.equal((await recover()).status, "reconciliation_required")
    assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0); assert.equal(calls.length, 1)
  })
  test("signed outcome proof preserves independent debt and never queues a false trial-success message", async () => {
    await uncertain(); const delivered = { ...structuredClone(subscription), trial_end: (db.operations[0].targetExpiresAt as Date).getTime() / 1000 }
    subscription.trial_end = delivered.trial_end
    subscription.latest_invoice = { id: "in_debt", customer: "cus_1", parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
      status: "open", amount_remaining: 1000, attempt_count: 1, due_date: null }
    assert.equal((await signedUpdate({}, delivered)).status, 200)
    assert.equal((db.operations[0].result as Row).status, "superseded"); assert.equal(db.risks[0].blocking, true)
    assert.equal(db.notifications.length, 0); assert.equal(db.grants.length, 0); assert.equal(db.profile.pendingTrialOperationId, null)
  })
  for (const fault of ["audit.trial_result", "notification.create", "profile.update", "operation.update"]) {
    test(`webhook ${fault} rolls back result/outbox/projection and terminal ledger, redelivery recovers once`, async () => {
      await uncertain(); subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
      db.fault = fault
      assert.equal((await signedUpdate()).status, 503)
      assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0)
      assert.equal(ledger.rows.get("evt_trial")?.processingStatus, "failed")
      db.fault = null; assert.equal((await signedUpdate()).status, 200)
      assert.equal(db.profile.pendingTrialOperationId, null); assert.equal(db.notifications.length, 1)
      assert.equal(db.audits.filter((a) => ((a.metadata as Row).result as Row).status === "succeeded").length, 1)
    })
  }
  test("terminal ledger failure rolls back owner finalization too", async () => {
    await uncertain(); subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000; ledger.finishError = true
    assert.equal((await signedUpdate()).status, 503); assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal(db.notifications.length, 0); assert.notEqual(db.operations[0].status, "succeeded")
    ledger.finishError = false; ledger.rows.get("evt_trial")!.processingLeaseUntil = new Date(0)
    assert.equal((await signedUpdate()).status, 200); assert.equal(db.notifications.length, 1)
  })
  test("lost ledger token during owner result persistence cannot commit projection/audit/outbox/release", async () => {
    await uncertain(); subscription.trial_end = (db.operations[0].targetExpiresAt as Date).getTime() / 1000
    db.auditHook = () => { if (((db.audits.at(-1)?.metadata as Row)?.action) === "trial_result") {
      ledger.rows.get("evt_trial")!.processingToken = "replaced-token"
    } }
    assert.equal((await signedUpdate()).status, 503); assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal(db.notifications.length, 0)
    assert.equal(db.audits.filter((a) => ((a.metadata as Row).result as Row).status === "succeeded").length, 0)
  })
  test("invalid signature is rejected before persistence or provider reads", async () => {
    await uncertain(); const before = db.snapshot(), count = reads
    const res = await route.POST(new Request("http://localhost/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "invalid" } }))
    assert.equal(res.status, 400); assert.deepEqual(db.snapshot(), before); assert.equal(reads, count); assert.equal(ledger.rows.size, 0)
  })
  test("delayed real newly bound subscription remains paid; original proof alone can close owner, never customer fence", async () => {
    await uncertain(); const delivered = { ...structuredClone(subscription), trial_end: (db.operations[0].targetExpiresAt as Date).getTime() / 1000 }
    newSubscription = { ...structuredClone(subscription), id: "sub_new", status: "active", trial_end: null }
    subscription.status = "canceled"; subscription.trial_end = null
    db.profile.stripeSubscriptionId = "sub_new"; db.profile.subscriptionStatus = "active"; db.profile.trialEndsAt = null
    const before = db.profile.billingAccessVersion
    await coordinatorApi.reconcileTenantSubscription(provider(), tenant, "sub_new", { kind: "hosted_lifecycle" })
    assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.profile.subscriptionStatus, "active")
    assert.ok(Number(db.profile.billingAccessVersion) > Number(before))
    assert.equal((await signedUpdate({}, delivered)).status, 200)
    assert.equal((db.operations[0].result as Row).status, "superseded"); assert.equal(db.profile.pendingTrialOperationId, null)
    assert.equal(db.profile.stripeSubscriptionId, "sub_new"); assert.equal(db.profile.subscriptionStatus, "active")
    assert.equal(db.notifications.length, 0); assert.equal(calls.length, 1)
  })
  test("completed correlated Checkout binds verified new paid subscription under owner reservation; only original proof closes owner", async () => {
    await uncertain(); const originalProofObject = { ...structuredClone(subscription), trial_end: (db.operations[0].targetExpiresAt as Date).getTime() / 1000 }
    const metadata = { userId: tenant, operationId: other }
    checkoutSession = { id: "cs_old", mode: "subscription", status: "complete", payment_status: "paid",
      customer: "cus_1", subscription: "sub_new", metadata, created: Math.floor(start.getTime() / 1000) - 100 }
    newSubscription = { ...structuredClone(subscription), id: "sub_new", status: "active", trial_end: null, metadata }
    subscription.status = "canceled"; subscription.trial_end = null
    db.customerOperations.push({ id: other, userId: tenant, actorUserId: tenant, action: "checkout_create", status: "succeeded", parentMutationId: null,
      startingBinding: { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" }, startingVersion: 4, executionVersion: 5,
      stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", stripeSessionId: "cs_old", result: { url: "https://checkout.stripe.test/old" } })
    db.customerSteps.push({ userId: tenant, mutationId: other, stepKey: "checkout_create", status: "succeeded", stripeSessionId: "cs_old",
      firstAttemptAt: new Date(start.getTime() - 86400000), normalizedRequest: { customer: "cus_1", mode: "subscription", metadata,
        subscription_data: { metadata } } })
    const history = structuredClone(db.customerOperations)
    const payload = JSON.stringify({ id: "evt_delayed_checkout", type: "checkout.session.completed", created: Math.floor(start.getTime() / 1000),
      data: { object: checkoutSession } })
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = "whsec_dummy_trial"
    const response = await route.POST(new Request("http://localhost/webhook", { method: "POST", body: payload,
      headers: { "stripe-signature": signing.webhooks.generateTestHeaderString({ payload, secret: "whsec_dummy_trial" }) } }))
    assert.equal(response.status, 200); assert.equal(db.profile.stripeSubscriptionId, "sub_new")
    assert.equal(db.profile.subscriptionStatus, "active"); assert.equal(db.profile.trialEndsAt, null)
    assert.equal(db.profile.pendingTrialOperationId, id); assert.deepEqual(db.customerOperations, history)
    // Authenticated success observes the same truth without pretending the completed
    // customer's fence owns the unresolved owner reservation.
    await hostedApi.reconcileHostedCheckout(provider(), tenant, "cs_old", { kind: "hosted_lifecycle" })
    assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal((await signedUpdate({}, originalProofObject)).status, 200)
    assert.equal(db.profile.pendingTrialOperationId, null); assert.equal((db.operations[0].result as Row).status, "superseded")
    assert.equal(db.profile.subscriptionStatus, "active"); assert.equal(db.notifications.length, 0); assert.equal(calls.length, 1)
    assert.deepEqual(db.customerOperations, history)
  })
})
beforeEach(setup)

describe("Stripe-only owner extension — task 4.4", () => {
  test("notification persistence failure after confirmation never undoes Stripe/access success", async () => {
    await preview({ notify: true }); notificationError = true
    const result = await confirm(); assert.equal(result.status, "succeeded")
    if (result.status !== "succeeded") return
    assert.equal(result.notification?.status, "unknown"); assert.equal(db.profile.pendingTrialOperationId, null)
    assert.equal((db.operations[0].result as Row).notification, undefined); assert.equal(calls.length, 1)
  })
  test("fresh-session recovery commits access before independently handling notification failure", async () => {
    await uncertain(); owner.adminSession.id = "fresh-session"; notificationError = true
    const result = await recover(); assert.equal(result.status, "succeeded")
    if (result.status !== "succeeded") return
    assert.equal(result.notification?.status, "unknown"); assert.equal(db.profile.pendingTrialOperationId, null)
    assert.equal(db.operations[0].adminSessionId, "session-1"); assert.equal(calls.length, 2)
  })
  test("exact pinned update, durable attempt before call, fresh periods and atomic audited outbox/release", async () => {
    const predicted = await preview({ notify: true }); const original = structuredClone(db.profile)
    afterCall = () => { subscription.latest_invoice = { id: "in_1", customer: "cus_1", parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
      status: "paid", amount_remaining: 0, attempt_count: 0, due_date: null, period_start: start.getTime() / 1000, period_end: Date.parse("2026-11-01") / 1000 } }
    // Invoice payment reads are necessary for the fresh risk scan.
    const basic = provider
    const deps = { transaction: db.transaction, authorize: async () => owner, now: () => time,
      notify: async () => { assert.equal(db.locked, false); return undefined },
      stripe: () => ({ ...basic(), invoicePayments: { list: async () => ({ data: [], has_more: false }) } }) as unknown as Stripe }
    service = api.createStripeTrialExtensionService(deps)
    const result = await confirm()
    assert.equal(result.status, "succeeded")
    if (result.status !== "succeeded") return
    assert.equal(result.targetExpiresAt, predicted.target?.expiresAt); assert.equal(result.version, 9)
    assert.deepEqual(calls, [{ subscriptionId: "sub_1", params: { trial_end: Date.parse(result.targetExpiresAt) / 1000, proration_behavior: "none" },
      options: { idempotencyKey: `trial-extension/${id}`, maxNetworkRetries: 0 } }])
    assert.equal(db.profile.pendingTrialOperationId, null); assert.equal(db.profile.subscriptionTier, original.subscriptionTier)
    assert.deepEqual(db.profile.subscriptionCurrentPeriodEnd, new Date("2026-11-01"))
    assert.equal(db.notifications.length, 1); assert.equal(db.notifications[0].providerIdempotencyKey, `trial-access/${id}`)
    assert.equal(db.grants.length, 0); assert.equal(db.risks.length, 1)
    assert.deepEqual(db.audits.map((a) => (a.metadata as Row).action), ["trial_attempt", "trial_result"])
    assert.equal(db.operations[0].stripeRequestId, "req_1"); assert.deepEqual(db.operations[0].result, result)
    assert.ok(!JSON.stringify(result).includes("cus_")); assert.ok(!JSON.stringify(result).includes("Approved extension"))
  })
  test("later retained grant supplies full extension base but is never changed", async () => {
    db.grants.push({ userId: tenant, plan: "small_business", startsAt: new Date("2026-10-01"), expiresAt: new Date("2026-11-01"), revokedAt: null })
    const original = structuredClone(db.grants); const p = await preview()
    assert.equal(p.target?.expiresAt, "2026-11-08T00:00:00.000Z")
    assert.equal((await confirm()).status, "succeeded"); assert.deepEqual(db.grants, original)
  })
  test("completed replay returns stored immutable result despite TTL/version/reservations and sends nothing", async () => {
    await preview({ notify: true }); const first = await confirm(), snapshot = db.snapshot(), count = reads
    time = new Date("2026-12-01"); db.profile.billingAccessVersion = 100; db.profile.pendingBillingMutationId = other
    const before = db.snapshot(); const result = await confirm()
    assert.deepEqual(result, first); assert.equal(reads, count); assert.equal(calls.length, 1); assert.deepEqual(db.snapshot(), before)
    assert.equal((snapshot.audits as Row[]).length, 2); assert.equal(authCalls, 3)
  })
  test("concurrent identical confirmation dispatches once", async () => {
    await preview(); const results = await Promise.all([confirm(), confirm()])
    assert.equal(calls.length, 1); assert.ok(results.some((r) => r.status === "succeeded")); assert.equal(db.audits.length, 2)
  })
  for (const fault of ["audit.trial_attempt", "profile.updateMany", "operation.updateMany", "acceptance_commit"]) {
    test(`${fault} prevents provider dispatch and rolls back acceptance`, async () => {
      await preview(); const original = db.snapshot(); db.fault = fault
      await reject(confirm, "trial_operation_unavailable"); assert.deepEqual(db.snapshot(), original); assert.equal(calls.length, 0)
    })
  }
  for (const fault of ["audit.trial_result", "notification.create", "operation.update", "profile.update", "commit"]) {
    test(`Stripe success then ${fault} retains uncertainty, never reports success or fallback`, async () => {
      await preview({ notify: true }); afterCall = () => { db.fault = fault }
      assert.equal((await confirm()).status, "reconciliation_required")
      assert.equal(calls.length, 1); assert.equal(db.profile.pendingTrialOperationId, id)
      assert.deepEqual(db.profile.trialEndsAt, new Date("2026-10-21")); assert.equal(db.notifications.length, 0); assert.equal(db.grants.length, 0)
      assert.ok(db.audits.every((row) => ((row.metadata as Row).result as Row).status !== "succeeded"))
      assert.ok(["pending", "reconciliation_required"].includes(db.operations[0].status as string))
    })
  }
  test("definitive validation rejection is auditable, releases only reservation and replays failure", async () => {
    await preview({ notify: true }); providerError = validationError(); const oldExpiry = db.profile.trialEndsAt
    const result = await confirm(); assert.equal(result.status, "failed")
    assert.equal(db.profile.pendingTrialOperationId, null); assert.equal(db.profile.billingAccessVersion, 9)
    assert.equal(db.profile.trialEndsAt, oldExpiry); assert.equal(db.notifications.length, 0); assert.equal(db.grants.length, 0)
    assert.equal(db.audits.length, 2); assert.deepEqual(await confirm(), result); assert.equal(calls.length, 1)
    assert.ok(!JSON.stringify(db.snapshot()).includes("private provider data"))
  })
  test("failure audit cannot be suppressed to release a known rejected operation", async () => {
    await preview(); providerError = validationError(); db.auditHook = () => { db.fault = "audit.trial_result" }
    assert.equal((await confirm()).status, "reconciliation_required"); assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal(db.operations[0].status, "pending"); assert.equal(db.audits.length, 1)
  })
  for (const error of [new Error("timeout"), { type: "StripeConnectionError" }, { type: "StripeAPIError", statusCode: 500 },
    { ...validationError(), code: "idempotency_key_in_use" }, { ...validationError(), code: "idempotency_error" },
    { statusCode: 400 }, { ...validationError(), statusCode: 429 }]) {
    test(`uncertain ${JSON.stringify(error)} retains reservation and never automatically retries`, async () => {
      await preview({ notify: true }); providerError = error
      const result = await confirm(); assert.equal(result.status, "reconciliation_required")
      assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.operations[0].status, "reconciliation_required")
      assert.equal(db.notifications.length, 0); assert.equal(db.grants.length, 0)
      const key = db.operations[0].stripeIdempotencyKey, first = db.operations[0].firstAttemptAt
      time = new Date("2026-10-18"); assert.deepEqual(await confirm(), result)
      assert.equal(calls.length, 1); assert.equal(db.operations[0].stripeIdempotencyKey, key); assert.deepEqual(db.operations[0].firstAttemptAt, first)
    })
  }
  for (const status of ["active", "canceled", "past_due", "paused"]) {
    test(`newer real ${status} is reconciled without stale target success or reservation release`, async () => {
      await preview({ notify: true }); afterCall = () => { subscription.status = status; subscription.trial_end = null }
      const result = await confirm(); assert.equal(result.status, "reconciliation_required")
      assert.equal(db.profile.subscriptionStatus, status); assert.equal(db.profile.trialEndsAt, null)
      assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0); assert.equal(db.grants.length, 0)
    })
  }
  for (const change of ["fence", "lease", "binding"]) {
    test(`${change} changed during call cannot finalize or clear reservation`, async () => {
      await preview(); afterCall = () => {
        if (change === "fence") db.operations[0].fencingToken = 2
        if (change === "lease") time = new Date(start.getTime() + 60000)
        if (change === "binding") { db.profile.stripeSubscriptionId = "sub_new"; db.profile.subscriptionStatus = "active" }
      }
      assert.equal((await confirm()).status, "reconciliation_required")
      assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0); assert.equal(db.audits.length, 1)
      if (change === "binding") assert.equal(db.profile.subscriptionStatus, "active")
    })
  }
  for (const field of ["schedule", "cancel_at", "cancel_at_period_end", "pending_update", "pause_collection", "pending_invoice_item_interval", "next_pending_invoice_item_invoice", "items", "price", "quantity", "unknown"]) {
    test(`changed unsupported ${field} blocks before acceptance, no grant fallback`, async () => {
      await preview()
      if (field === "cancel_at_period_end") subscription[field] = true
      else if (field === "cancel_at") subscription[field] = start.getTime() / 1000
      else if (field === "items") (subscription.items as Row).has_more = true
      else if (["price", "quantity"].includes(field)) {
        const item = ((subscription.items as Row).data as Row[])[0]
        if (field === "price") (item.price as Row).id = "unmapped"
        else item.quantity = 2
      } else if (field === "unknown") delete subscription.schedule
      else subscription[field] = field === "schedule" ? "sub_sched_1" : {}
      await reject(confirm); assert.equal(calls.length, 0); assert.equal(db.grants.length, 0); assert.equal(db.audits.length, 0)
    })
  }
  for (const reservation of ["pendingTrialOperationId", "pendingBillingMutationId"]) {
    test(`${reservation} is mutually exclusive even with expired foreign lease`, async () => {
      await preview(); db.profile[reservation] = other
      await reject(confirm); assert.equal(calls.length, 0); assert.equal(db.audits.length, 0)
    })
  }
  test("horizon failure occurs before audit and provider call", async () => {
    subscription.billing_cycle_anchor = Date.parse("2024-11-01") / 1000
    subscription.trial_start = Date.parse("2024-11-01") / 1000
    await preview({ days: 30 }); await reject(confirm, "trial_stripe_horizon_exceeded")
    assert.equal(calls.length, 0); assert.equal(db.profile.pendingTrialOperationId, null); assert.equal(db.audits.length, 0)
  })
  test("anchor and total-trial 730-day boundaries inclusive, one second later blocked; leap anchor conservative", () => {
    const sub = subscription as unknown as Stripe.Subscription
    const horizon = new Date(start.getTime() + 730 * 86400000)
    api.validateStripeTrialExtension(sub, horizon, start)
    assert.throws(() => api.validateStripeTrialExtension(sub, new Date(horizon.getTime() + 1000), start), /horizon/)
    sub.billing_cycle_anchor = Date.parse("2024-02-29") / 1000; sub.trial_start = sub.billing_cycle_anchor
    api.validateStripeTrialExtension({ ...sub, trial_end: Date.parse("2024-03-01") / 1000 }, new Date("2026-02-28"), new Date("2024-03-01"))
    assert.throws(() => api.validateStripeTrialExtension(sub, new Date("2026-03-01"), start), /horizon/)
    sub.trial_start = Date.parse("2023-01-01") / 1000
    assert.throws(() => api.validateStripeTrialExtension(sub, new Date("2026-02-01"), start), /horizon/)
  })
  test("audit crossing TTL rolls back acceptance; no provider call", async () => {
    await preview(); db.auditHook = () => { time = new Date(start.getTime() + 15 * 60000) }
    await reject(confirm, "trial_preview_expired"); assert.equal(calls.length, 0); assert.equal(db.audits.length, 0)
  })
  test("acceptance commit crossing lease never dispatches and retains reservation", async () => {
    await preview(); db.commitHook = () => { time = new Date(start.getTime() + 60000) }
    assert.equal((await confirm()).status, "reconciliation_required"); assert.equal(calls.length, 0); assert.equal(db.profile.pendingTrialOperationId, id)
  })
  test("initial owner authorization and current context enforced on every confirm/replay", async () => {
    await preview(); await confirm(); const transactions = db.transactions
    owner.platformRole.role = "platform_admin"
    await reject(confirm, "trial_owner_required"); assert.equal(db.transactions, transactions); assert.equal(calls.length, 1)
  })
  for (const role of ["platform_support", "platform_admin"] as const) {
    test(`direct DEFAULT Stripe service rejects elevated ${role} before transactions/provider/audit`, async () => {
      owner.platformRole.role = role
      const before = db.snapshot(), transactions = db.transactions
      await reject(() => api.createStripeTrialExtensionService().confirm(tenant, { operationId: id, expectedVersion: 7 }, request), "trial_owner_required")
      assert.equal(authCalls, 1); assert.equal(db.transactions, transactions)
      assert.deepEqual(db.snapshot(), before); assert.equal(calls.length, 0); assert.equal(reads, 0)
    })
  }
  test("direct confirmation requires a saved preview, not legacy days or a supplied reason", async () => {
    const before = db.snapshot()
    await reject(confirm, "trial_operation_not_found")
    for (const body of [{ days: 7 }, { operationId: id, expectedVersion: 7, reason: "Bypass preview" },
      { operationId: id, expectedVersion: 7, days: 7 }]) {
      await assert.rejects(() => service.confirm(tenant, body, request))
    }
    assert.deepEqual(db.snapshot(), before); assert.equal(calls.length, 0)
  })
  test("reason is mandatory in preview and immutable through shared saga attempt/result audits", async () => {
    for (const reason of [undefined, "", "   ", "x".repeat(1001)]) {
      await assert.rejects(() => preview({ reason }))
      assert.equal(db.operations.length, 0); assert.equal(db.audits.length, 0); assert.equal(calls.length, 0)
    }
    await preview({ reason: "  Approved evaluation  " })
    assert.equal(db.operations[0].reason, "Approved evaluation")
    assert.equal((await confirm()).status, "succeeded")
    assert.equal(db.operations[0].reason, "Approved evaluation")
    assert.deepEqual(db.audits.map((a) => a.reason), ["Approved evaluation", "Approved evaluation"])
    const original = db.snapshot()
    await confirm()
    assert.deepEqual(db.snapshot(), original); assert.equal(calls.length, 1)
  })
  test("foreign owner/session is indistinguishable from missing operation", async () => {
    await preview(); owner.adminSession.id = "another-session"
    await reject(confirm, "trial_operation_not_found"); assert.equal(calls.length, 0)
  })
  test("explicit fractional expiry is frozen to seconds, never recomputed from confirmation time", async () => {
    const predicted = await preview({ days: undefined, expiresAt: "2026-11-02T10:15:20.999Z" })
    time = new Date(start.getTime() + 60000)
    const result = await confirm(); assert.equal(result.status, "succeeded")
    if (result.status === "succeeded") assert.equal(result.targetExpiresAt, predicted.target?.expiresAt)
    assert.deepEqual((calls[0].params as Row).trial_end, Date.parse("2026-11-02T10:15:20Z") / 1000)
  })
  test("two live subscriptions block the saga before attempt or provider mutation", async () => {
    await preview()
    service = api.createStripeTrialExtensionService({ transaction: db.transaction, authorize: async () => owner, now: () => time,
      stripe: () => {
        const p = provider()
        p.subscriptions.list = (async () => ({ data: [subscription, { ...subscription, id: "sub_2" }], has_more: false })) as unknown as Stripe["subscriptions"]["list"]
        return p
      } })
    await reject(confirm); assert.equal(calls.length, 0); assert.equal(db.audits.length, 0); assert.equal(db.grants.length, 0)
  })
  test("unsupported items, metered use and unknown lifecycle flags fail closed", () => {
    for (const state of ["multiple_items", "metered", "unknown_anchor", "unknown_trial_start", "unknown_pending"]) {
      const sub = structuredClone(subscription) as unknown as Stripe.Subscription
      if (state === "multiple_items") sub.items.data.push(sub.items.data[0])
      if (state === "metered") sub.items.data[0].price.recurring!.usage_type = "metered"
      if (state === "unknown_anchor") sub.billing_cycle_anchor = Number.NaN
      if (state === "unknown_trial_start") sub.trial_start = null
      if (state === "unknown_pending") (sub as unknown as Row).pending_update = undefined
      assert.throws(() => api.validateStripeTrialExtension(sub, new Date("2026-10-28"), start))
    }
  })
  test("fresh invoice debt is retained independently; no success notification or grant", async () => {
    await preview({ notify: true })
    afterCall = () => { subscription.latest_invoice = { id: "in_debt", customer: "cus_1", parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
      status: "open", amount_remaining: 1000, attempt_count: 1, due_date: null, period_start: start.getTime() / 1000, period_end: Date.parse("2026-11-01") / 1000 } }
    assert.equal((await confirm()).status, "reconciliation_required")
    assert.equal(db.risks.length, 1); assert.equal(db.risks[0].blocking, true)
    assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(db.notifications.length, 0); assert.equal(db.grants.length, 0)
  })
  test("new cancellation after provider success preserves confirmed flags rather than clearing intent", async () => {
    await preview({ notify: true }); afterCall = () => { subscription.cancel_at_period_end = true }
    assert.equal((await confirm()).status, "reconciliation_required")
    assert.equal(db.profile.subscriptionCancelAtPeriodEnd, true); assert.equal(db.profile.pendingTrialOperationId, id)
    assert.equal(db.notifications.length, 0); assert.equal(db.grants.length, 0)
  })
  test("result-audit crossing lease cannot finalize, notify or release", async () => {
    await preview({ notify: true })
    afterCall = () => { db.auditHook = () => { time = new Date(start.getTime() + 60000) } }
    assert.equal((await confirm()).status, "reconciliation_required")
    assert.equal(db.audits.length, 1); assert.equal(db.notifications.length, 0); assert.equal(db.profile.pendingTrialOperationId, id)
  })
  test("internal evidence seam requires an actual current owner fence", async () => {
    await preview(); providerError = new Error("timeout"); await confirm()
    const op = db.operations[0]
    const fence = { kind: "owner" as const, operationId: id, leaseOwner: op.leaseOwner as string, fencingToken: op.fencingToken as number }
    await db.transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `billing-access:${tenant}`)
      const profile = await tx.userProfile.findUnique({ where: { userId: tenant } })
      assert.ok(profile)
      return api.readFencedStripeTrialOperation(tx, profile, { ...fence, fencingToken: 99 }, time)
    }).then(() => assert.fail("forged fence accepted"), (error: unknown) => {
      assert.ok(error instanceof Error && "code" in error && error.code === "trial_operation_fence_lost")
    })
    assert.equal(db.profile.pendingTrialOperationId, id); assert.equal(calls.length, 1)
  })
  test("static contract: pinned client, no additional mutation endpoints or customer/grant writes", () => {
    const source = readFileSync(new URL("../lib/billing/stripeTrialExtension.ts", import.meta.url), "utf8")
    assert.equal((source.match(/\.subscriptions\.update\(/g) ?? []).length, 1)
    assert.doesNotMatch(source, /tenantTrialGrant\.(create|update|upsert|delete)|subscriptionSchedules\.|\.resume\(|\.cancel\(/)
    const client = readFileSync(new URL("../lib/billing/stripeClient.ts", import.meta.url), "utf8")
    assert.match(client, /apiVersion: "2026-05-27.dahlia"/)
  })
})