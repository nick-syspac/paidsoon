import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type Stripe from "stripe"
import type { AdminGuardContext } from "@/lib/admin/guard"
import type { Prisma } from "@/lib/generated/prisma/client"

type Row = Record<string, unknown>
const tenant = "11111111-1111-4111-8111-111111111111"
const foreign = "22222222-2222-4222-8222-222222222222"
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const originId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const start = new Date("2026-10-16T00:00:00Z")
const request = { ipAddress: "127.0.0.1", userAgent: "unit-test", requestId: "request-1" }
let api: typeof import("@/lib/billing/trialAccessOperations")
let previewApi: typeof import("@/lib/billing/trialAccessPreview")
let previews: ReturnType<typeof previewApi.createTrialAccessPreviewService>
let service: ReturnType<typeof api.createTrialAccessOperationService>
let db: Database
let time: Date
let owner: AdminGuardContext
let subscription: Row
let providerReads: number
let readHook: (() => void) | undefined
let authorizations: number
let targetOwner = false

function input(overrides: Row = {}): Row {
  return { operationId: id, action: "extend_or_grant", days: 7, plan: "business_control",
    reason: "  Approved evaluation  ", timeZone: "UTC", expectedVersion: 7, ...overrides }
}
const confirmation = (operationId = id, expectedVersion = 7) => ({ operationId, expectedVersion })
const revoke = (overrides: Row = {}) => ({ operationId: id, action: "revoke_grant", reason: " Remove access ",
  timeZone: "UTC", expectedVersion: 7, ...overrides })
function grant(overrides: Row = {}): Row {
  return { id: "original-grant", userId: tenant, plan: "small_business", startsAt: new Date("2026-10-01"),
    expiresAt: new Date("2026-10-30"), revokedAt: null, creatorOperationId: originId,
    lastOperationId: originId, createdAt: new Date("2026-10-01"), ...overrides }
}
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return (value.in as unknown[]).includes(row[key])
      return matches(row[key] as Row, value as Row)
    }
    return row[key] === value
  })
}
function project(row: Row | undefined, select?: Row): Row | null {
  return row ? structuredClone(select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row) : null
}

/** Serialized transactional state copy, fault injection and write-shape guards.
 * This proves service rollback/ordering, NOT PostgreSQL advisory/FK enforcement.
 */
class Database {
  profiles: Row[] = [{ userId: tenant, stripeCustomerId: null, stripeSubscriptionId: null, stripePriceId: null,
    subscriptionStatus: "trialing", subscriptionTier: "essentials", trialEndsAt: new Date("2026-10-20"),
    billingAccessVersion: 7, pendingTrialOperationId: null, pendingBillingMutationId: null,
    subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null, subscriptionCancelAt: null,
    subscriptionCancelAtPeriodEnd: false, stripeScheduleId: null, pendingDowngradeTier: null }]
  grants: Row[] = []
  risks: Row[] = []
  operations: Row[] = []
  notifications: Row[] = []
  audits: Row[] = []
  invoices: Row[] = [{ id: "invoice-1", firstChasedAt: new Date("2026-10-02"), stage: 2, state: "chasing" }]
  writes: string[] = []
  reads = 0
  transactions = 0
  locked = false
  fault: string | null = null
  afterAttempt: (() => void) | undefined
  private tail = Promise.resolve()
  get profile(): Row { return this.profiles[0] }
  snapshot(): Row {
    return structuredClone({ profiles: this.profiles, grants: this.grants, risks: this.risks,
      operations: this.operations, notifications: this.notifications, audits: this.audits, invoices: this.invoices })
  }
  delegate(name: string, rows: () => Row[]) {
    const write = (action: string, data: Row) => {
      assert.ok(this.locked)
      const label = `${name}.${action}`
      this.writes.push(label)
      if (this.fault === label || (name === "audit" && this.fault === `audit.${data.metadata && (data.metadata as Row).action}`)) {
        throw new Error("private persistence failure")
      }
      if (name === "profile") assert.deepEqual(Object.keys(data), ["billingAccessVersion"])
      if (name === "grant") {
        assert.ok(this.audits.some((row) => (row.metadata as Row).action === "trial_attempt"), "attempt must exist BEFORE grant writes")
        for (const field of ["creatorOperationId", "lastOperationId"]) {
          if (data[field]) assert.ok(this.operations.some((op) => op.id === data[field] && op.userId === tenant), "same-tenant operation FK")
        }
      }
      if (name === "notification" && action === "create") {
        assert.ok(!this.notifications.some((n) => n.operationId === data.operationId), "one outbox per operation")
        assert.equal(data.status, "pending")
        assert.equal(data.providerIdempotencyKey, `trial-access/${data.operationId}`)
        for (const key of ["recipientEmail", "recipientName", "renderedPayload", "sentAt"]) assert.ok(!(key in data))
      }
    }
    const apply = (row: Row, data: Row) => {
      for (const [key, value] of Object.entries(structuredClone(data))) {
        row[key] = value && typeof value === "object" && "increment" in value
          ? Number(row[key]) + Number(value.increment) : value
      }
      return structuredClone(row)
    }
    return {
      findUnique: async ({ where, select }: { where: Row; select?: Row }) => {
        assert.ok(this.locked); this.reads++
        return project(rows().find((row) => matches(row, where)), select)
      },
      findMany: async ({ where, select }: { where: Row; select?: Row }) => {
        assert.ok(this.locked); this.reads++
        return rows().filter((row) => matches(row, where)).map((row) => project(row, select))
      },
      create: async ({ data }: { data: Row }) => {
        write("create", data)
        if (name === "grant") assert.ok(!rows().some((row) => row.userId === data.userId), "unique tenant grant")
        const row = { id: `generated-${name}`, result: null, revokedAt: null, attempts: 0,
          firstAttemptAt: null, sentAt: null, ...structuredClone(data) }
        rows().push(row)
        if (name === "audit" && (data.metadata as Row).action === "trial_attempt") this.afterAttempt?.()
        return structuredClone(row)
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        write("update", data)
        const row = rows().find((row) => matches(row, where)); assert.ok(row)
        return apply(row, data)
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        write("updateMany", data)
        if (this.fault === `${name}.cas`) return { count: 0 }
        const found = rows().filter((row) => matches(row, where))
        for (const row of found) apply(row, data)
        return { count: found.length }
      },
    }
  }
  transaction = async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    this.transactions++
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    const original = this.snapshot()
    const tx = {
      $executeRawUnsafe: async (sql: string, key: string) => {
        assert.equal(sql, "SELECT pg_advisory_xact_lock(hashtext($1))")
        assert.ok(key === `billing-access:${tenant}` || key === `billing-access:${foreign}`)
        this.locked = true
      },
      userProfile: this.delegate("profile", () => this.profiles),
      tenantTrialGrant: this.delegate("grant", () => this.grants),
      tenantTrialOperation: this.delegate("operation", () => this.operations),
      tenantTrialNotification: this.delegate("notification", () => this.notifications),
      tenantBillingRisk: this.delegate("risk", () => this.risks),
      tenantBillingMutation: this.delegate("customer", () => []),
      adminAuditEvent: this.delegate("audit", () => this.audits),
    }
    try {
      const result = await run(tx as unknown as Prisma.TransactionClient)
      if (this.fault === "commit") throw new Error("private commit failure")
      return result
    } catch (error) { Object.assign(this, original); throw error }
    finally { this.locked = false; release() }
  }
}
function provider(): Stripe {
  const read = () => { assert.ok(db.locked); providerReads++; readHook?.() }
  return {
    customers: { retrieve: async () => { read(); return { id: "cus_1", metadata: {} } } },
    subscriptions: {
      list: async () => { read(); return { data: [structuredClone(subscription)], has_more: false } },
      retrieve: async () => { read(); return structuredClone(subscription) },
      update: async () => { assert.fail("Stripe mutation forbidden") },
    },
    invoices: { list: async () => { read(); return { data: [], has_more: false } } },
    charges: { list: async () => { read(); return { data: [], has_more: false } } },
  } as unknown as Stripe
}
function linked(status: string): void {
  Object.assign(db.profile, { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: status })
  subscription.status = status
}
function setup(): void {
  targetOwner = false
  db = new Database(); time = new Date(start); providerReads = 0; authorizations = 0; readHook = undefined
  owner = { userId: "owner-1", userEmail: "owner@example.test",
    platformRole: { userId: "owner-1", role: "platform_owner", status: "active" },
    adminSession: { id: "session-1", userId: "owner-1", adminDeviceId: "device-1", revokedAt: null, expiresAt: new Date("2027-01-01") },
  } as AdminGuardContext
  subscription = { id: "sub_1", customer: "cus_1", metadata: {}, status: "trialing",
    items: { has_more: false, data: [{ quantity: 1, price: { id: "price_control", type: "recurring", recurring: { usage_type: "licensed" } } }] },
    trial_start: start.getTime() / 1000, trial_end: Date.parse("2026-10-21") / 1000,
    billing_cycle_anchor: start.getTime() / 1000, latest_invoice: null, cancel_at: null, cancel_at_period_end: false,
    schedule: null, pending_update: null, pause_collection: null, pending_invoice_item_interval: null, next_pending_invoice_item_invoice: null }
  const dependencies = { transaction: db.transaction, authorize: async () => { authorizations++; return owner }, now: () => time, stripe: provider,
    notify: async () => { assert.equal(db.operations.find((op) => op.id === id)?.status, "succeeded"); return undefined } }
  previews = previewApi.createTrialAccessPreviewService(dependencies)
  service = api.createTrialAccessOperationService(dependencies)
}
async function confirm(operationId = id, version = 7) {
  return service.confirm(tenant, confirmation(operationId, version), request)
}
async function rejects(run: () => Promise<unknown>, code: string, status = 409): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof previewApi.TrialPreviewError && error.code === code && error.status === status)
}
function currentGrant(overrides: Row = {}): void {
  db.operations.push({ id: originId, userId: tenant, status: "succeeded", source: "admin_grant", result: { historical: true } })
  db.grants.push(grant(overrides))
}
before(async () => {
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: new Proxy({}, { get(_target, key) {
    if (key === "platformRole") return { findUnique: async (query: { where: { userId: string }; select: Row }) => {
      assert.deepEqual(query, { where: { userId: tenant }, select: { role: true, status: true } })
      return targetOwner ? { role: "platform_owner", status: "active" } : null
    } }
    throw new Error("live DB forbidden")
  } }) } })
  mock.module("@/lib/admin/guard", { namedExports: { requireAdminElevation: async () => { throw new Error("unmocked auth forbidden") } } })
  mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: () => { throw new Error("live provider forbidden") } } })
  process.env.STRIPE_SOLO_PRICE_ID = "price_control"
  previewApi = await import("@/lib/billing/trialAccessPreview")
  api = await import("@/lib/billing/trialAccessOperations")
})
beforeEach(setup)

describe("atomic local owner trial operations — task 4.3", () => {
  for (const targetIsOwner of [false, true]) test(`grant revocation projects target role, not acting owner's role (${targetIsOwner})`, async () => {
    targetOwner = targetIsOwner
    Object.assign(db.profile, { subscriptionStatus: "active", subscriptionTier: "small_business", trialEndsAt: null })
    currentGrant()
    const preview = await previews.preview(tenant, revoke())
    assert.equal(preview.previous.source, "admin_grant")
    const result = await confirm()
    assert.equal(result.source, "admin_grant", "operation source is unchanged")
    assert.equal(result.after.source, targetIsOwner ? "platform_owner" : "none")
    assert.equal(result.after.allowAccess, targetIsOwner)
    assert.equal(result.after.effectiveAccessExpiresAt, null)
    assert.equal(result.after.effectiveTrialExpiresAt, null)
    assert.equal(result.after.effectiveExpirySource, null)
    assert.equal(((db.audits.at(-1)!.metadata as Row).after as Row).source, result.after.source)
    assert.doesNotMatch(JSON.stringify(result), /platformOwnerAccess|platformRole|"role"/)
  })
  test("notification audit failure after commit returns separate uncertainty without rolling back granted access", async () => {
    await previews.preview(tenant, input({ notify: true }))
    service = api.createTrialAccessOperationService({ transaction: db.transaction, authorize: async () => owner, now: () => time,
      stripe: provider, notify: async () => {
        assert.equal(db.locked, false); assert.equal(db.operations[0].status, "succeeded")
        throw new Error("delivery audit unavailable")
      } })
    const result = await confirm()
    assert.equal(result.status, "succeeded"); assert.equal(result.notification?.status, "unknown")
    assert.equal(db.grants.length, 1); assert.equal(db.profile.billingAccessVersion, 8)
    assert.equal((db.operations[0].result as Row).notification, undefined)
    assert.equal(db.notifications[0].status, "pending")
  })
  for (const plan of ["essentials", "business_control", "small_business", "business_pro"]) {
    test(`creates ${plan} with exact frozen expiry, audit/version/result and no default notification`, async () => {
      const preview = await previews.preview(tenant, input({ plan }))
      const profile = structuredClone(db.profile), usage = structuredClone(db.invoices)
      time = new Date(start.getTime() + 60000)
      db.writes = []; const transactions = db.transactions
      const result = await confirm()
      assert.equal(db.transactions, transactions + 1, "validation and acceptance use SAME transaction")
      assert.equal(authorizations, 2, "preview and confirm each authenticate on the server")
      assert.equal(result.targetExpiresAt, preview.target?.expiresAt)
      assert.equal(result.after.source, "admin_grant"); assert.equal(result.after.effectivePlan, plan)
      assert.equal(result.after.grant?.startsAt, time.toISOString())
      assert.equal(result.version, 8); assert.equal(result.notificationStatus, "not_requested")
      assert.equal(db.grants.length, 1); assert.equal(db.notifications.length, 0)
      assert.deepEqual(db.profile, { ...profile, billingAccessVersion: 8 }); assert.deepEqual(db.invoices, usage)
      assert.deepEqual(db.operations[0].result, result); assert.equal(db.operations[0].attempts, 1)
      assert.deepEqual(db.writes, ["audit.create", "grant.create", "profile.updateMany", "notification.updateMany", "operation.updateMany", "audit.create"])
      assert.deepEqual(db.audits.map((row) => (row.metadata as Row).action), ["trial_attempt", "trial_result"])
      assert.ok(db.audits.every((row) => row.reason === "Approved evaluation" && row.adminSessionId === "session-1"))
      const after = (db.audits[1].metadata as Row).after as Row
      assert.equal(after.billingAccessVersion, 8); assert.equal(after.grantPlan, plan)
      assert.equal(after.grantExpiresAt, result.targetExpiresAt)
      const attempt = db.audits[0].metadata as Row
      assert.equal((attempt.previous as Row).billingAccessVersion, 7)
      assert.deepEqual(attempt.after, (db.audits[1].metadata as Row).after, "attempt records intended target before mutation")
      const safe = JSON.stringify(result)
      for (const secret of [tenant, "owner-1", "session-1", "Approved evaluation", "cus_", "sub_", "inputHash", "providerIdempotencyKey"]) assert.ok(!safe.includes(secret))
      assert.equal(providerReads, 0)
    })
  }
  test("current grant extension/plan change preserves logical ID, creator, window and lifetime usage", async () => {
    currentGrant()
    const previous = structuredClone(db.grants[0]), history = structuredClone(db.operations[0]), usage = structuredClone(db.invoices)
    await previews.preview(tenant, input({ plan: "business_pro" }))
    const result = await confirm()
    assert.deepEqual(db.grants[0], { ...previous, plan: "business_pro", expiresAt: new Date(result.targetExpiresAt!), lastOperationId: id })
    assert.deepEqual(db.operations[0], history); assert.deepEqual(db.invoices, usage)
    assert.equal(result.after.grant?.startsAt, "2026-10-01T00:00:00.000Z")
    const metadata = db.audits[1].metadata as Row
    assert.equal((metadata.previous as Row).grantPlan, "small_business")
    assert.equal((metadata.after as Row).grantPlan, "business_pro")
  })
  for (const prior of ["expired", "revoked"]) {
    test(`new grant after ${prior} replaces logical ID in unique row, preserves historical operations and resets only window`, async () => {
      currentGrant(prior === "expired" ? { expiresAt: start } : { revokedAt: new Date("2026-10-15") })
      db.profile.trialEndsAt = new Date("2026-10-01")
      const history = structuredClone(db.operations[0]), usage = structuredClone(db.invoices)
      await previews.preview(tenant, input())
      const result = await confirm()
      assert.equal(db.grants.length, 1); assert.notEqual(db.grants[0].id, "original-grant")
      assert.deepEqual(db.grants[0].startsAt, start); assert.equal(db.grants[0].creatorOperationId, id)
      assert.equal(db.grants[0].lastOperationId, id); assert.equal(db.grants[0].revokedAt, null)
      assert.equal(result.targetExpiresAt, "2026-10-23T00:00:00.000Z")
      assert.deepEqual(db.operations[0], history); assert.deepEqual(db.invoices, usage)
      assert.ok(db.writes.includes("grant.update")); assert.ok(!db.writes.includes("grant.create"))
    })
  }
  for (const remaining of ["paid", "stripe_trial", "onboarding_trial", "past_due_grace", "none"]) {
    test(`revoke leaves independent ${remaining} source and all billing/usage fields unchanged`, async () => {
      currentGrant()
      if (remaining === "paid") linked("active")
      if (remaining === "stripe_trial") linked("trialing")
      if (remaining === "past_due_grace") linked("past_due")
      if (remaining === "none") db.profile.trialEndsAt = new Date("2026-10-01")
      const profile = structuredClone(db.profile), usage = structuredClone(db.invoices), previous = structuredClone(db.grants[0])
      await previews.preview(tenant, revoke())
      const result = await confirm()
      assert.equal(result.after.source, remaining); assert.equal(result.after.allowAccess, remaining !== "none")
      assert.deepEqual(db.grants[0], { ...previous, revokedAt: start, lastOperationId: id })
      assert.deepEqual(db.profile, { ...profile, billingAccessVersion: 8 }); assert.deepEqual(db.invoices, usage)
      assert.equal(providerReads, 0); assert.equal(result.targetExpiresAt, null)
    })
  }
  for (const status of ["unpaid", "incomplete", "incomplete_expired", "unknown", "canceled"]) {
    test(`revoke expired unrevoked row under ${status} and known risk without provider dependency`, async () => {
      currentGrant({ expiresAt: new Date("2026-10-01") }); db.profile.subscriptionStatus = status
      db.risks.push({ userId: tenant, kind: "subscription_invoice", stripeStatus: "uncollectible", blocking: true })
      await previews.preview(tenant, revoke())
      await confirm()
      assert.deepEqual(db.grants[0].revokedAt, start); assert.equal(providerReads, 0)
    })
  }
  for (const reason of ["", "   ", "x".repeat(1001)]) {
    test(`invalid reason length ${reason.length} cannot create confirmable intent`, async () => {
      await assert.rejects(() => previews.preview(tenant, input({ reason })), { name: "ZodError" })
      assert.deepEqual(db.writes, [])
    })
  }
  test("confirmation cannot supply replacement reason/plan/notify/expiry", async () => {
    await previews.preview(tenant, input())
    await assert.rejects(() => service.confirm(tenant, { ...confirmation(), reason: "replacement" }, request), { name: "ZodError" })
    assert.equal(db.audits.length, 0)
  })
  for (const field of ["reason", "targetExpiresAt", "targetPlan", "normalizedInput"]) {
    test(`tampered ${field} fails before audit or grant writes`, async () => {
      await previews.preview(tenant, input())
      if (field === "reason") db.operations[0].reason = "Changed reason"
      if (field === "targetExpiresAt") db.operations[0].targetExpiresAt = new Date("2026-12-01")
      if (field === "targetPlan") db.operations[0].targetPlan = "business_pro"
      if (field === "normalizedInput") (db.operations[0].normalizedInput as Row).days = 30
      db.writes = []
      await rejects(confirm, "trial_preview_corrupt", 503)
      assert.deepEqual(db.writes, [])
    })
  }
  test("requested outbox is pending, unresolved and unique; no sending or recipient resolution", async () => {
    await previews.preview(tenant, input({ notify: true }))
    const result = await confirm()
    assert.equal(result.notificationStatus, "pending"); assert.equal(db.notifications.length, 1)
    const outbox = structuredClone(db.notifications[0]), snapshot = db.snapshot()
    time = new Date("2027-02-01"); owner.adminSession.expiresAt = new Date("2028-01-01")
    assert.deepEqual(await confirm(), result); assert.deepEqual(db.snapshot(), snapshot)
    assert.deepEqual(db.notifications[0], outbox)
  })
  test("later change supersedes obsolete unsent notifications only, atomically", async () => {
    currentGrant()
    for (const status of ["pending", "failed", "blocked", "sent", "sending", "unknown", "superseded", "not_requested"]) {
      db.notifications.push({ userId: tenant, operationId: originId, operation: { status: "succeeded" },
        status, sentAt: status === "sent" ? start : null, firstAttemptAt: status === "failed" ? start : null })
    }
    db.notifications.push({ userId: foreign, operation: { status: "succeeded" }, status: "pending", sentAt: null })
    await previews.preview(tenant, revoke({ notify: true }))
    await confirm()
    assert.deepEqual(db.notifications.map((n) => n.status), ["superseded", "superseded", "superseded", "sent", "sending", "unknown", "superseded", "not_requested", "pending", "pending"])
    assert.ok(db.notifications.slice(0, 3).every((n) => n.sentAt === null))
  })
  for (const fault of ["audit.trial_attempt", "grant.create", "profile.updateMany", "profile.cas", "notification.updateMany", "notification.create", "operation.updateMany", "operation.cas", "audit.trial_result", "commit"]) {
    test(`${fault} rolls back grant/version/journal/audits/outbox and permits exact retry`, async () => {
      await previews.preview(tenant, input({ notify: true }))
      const original = db.snapshot(); db.writes = []; db.fault = fault
      await rejects(confirm, fault.endsWith(".cas") ? "trial_preview_stale" : "trial_operation_unavailable", fault.endsWith(".cas") ? 409 : 503)
      assert.deepEqual(db.snapshot(), original)
      if (fault === "audit.trial_attempt") assert.deepEqual(db.writes, ["audit.create"])
      db.fault = null
      assert.equal((await confirm()).status, "succeeded")
      assert.equal(db.audits.length, 2); assert.equal(db.notifications.length, 1)
    })
  }
  test("failed revocation/result audit rolls back removal and supersession", async () => {
    currentGrant(); db.notifications.push({ userId: tenant, operation: { status: "succeeded" }, status: "pending", sentAt: null })
    await previews.preview(tenant, revoke())
    const original = db.snapshot(); db.fault = "audit.trial_result"
    await rejects(confirm, "trial_operation_unavailable", 503)
    assert.deepEqual(db.snapshot(), original)
  })
  test("same-key concurrent confirmations replay exactly one atomic result", async () => {
    await previews.preview(tenant, input({ notify: true }))
    const [first, second] = await Promise.all([confirm(), confirm()])
    assert.deepEqual(first, second); assert.equal(db.audits.length, 2)
    assert.equal(db.notifications.length, 1); assert.equal(db.profile.billingAccessVersion, 8)
  })
  test("competing preview confirmations serialize; only one wins and stale other does not add days", async () => {
    await previews.preview(tenant, input())
    await previews.preview(tenant, input({ operationId: otherId, days: 14 }))
    const outcomes = await Promise.allSettled([confirm(), confirm(otherId)])
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1)
    assert.equal(db.audits.length, 2); assert.equal(db.profile.billingAccessVersion, 8)
    assert.equal(db.operations[1].status, "previewed")
    await rejects(() => confirm(otherId), "trial_preview_stale")
  })
  test("completed immutable replay ignores later version, reservations, access and delivery state", async () => {
    await previews.preview(tenant, input({ notify: true }))
    const first = await confirm()
    db.profile.billingAccessVersion = 99; db.profile.pendingBillingMutationId = otherId
    db.profile.subscriptionStatus = "active"; db.notifications[0].status = "failed"
    time = new Date("2026-12-01"); db.writes = []
    const replay = await confirm()
    assert.deepEqual(replay, first); assert.deepEqual(db.writes, [])
    replay.after.source = "none"
    assert.deepEqual(await confirm(), first, "caller cannot mutate stored result")
    await rejects(() => confirm(id, 99), "trial_preview_stale")
  })
  for (const reservation of ["pendingTrialOperationId", "pendingBillingMutationId"]) {
    test(`${reservation} blocks grant and revoke without any writes`, async () => {
      for (const action of ["grant", "revoke"]) {
        setup(); if (action === "revoke") currentGrant()
        await previews.preview(tenant, action === "revoke" ? revoke() : input())
        db.profile[reservation] = otherId; db.writes = []
        await assert.rejects(confirm, { name: "TenantBillingConflictError" })
        assert.deepEqual(db.writes, [])
      }
    })
  }
  for (const delta of [15 * 60000 - 1, 15 * 60000, 15 * 60000 + 1]) {
    test(`confirmation TTL +${delta}ms is exact and frozen target never moves`, async () => {
      const preview = await previews.preview(tenant, input())
      time = new Date(start.getTime() + delta)
      if (delta < 15 * 60000) assert.equal((await confirm()).targetExpiresAt, preview.target?.expiresAt)
      else { await rejects(confirm, "trial_preview_expired"); assert.equal(db.audits.length, 0) }
    })
  }
  test("linked canceled/paused source remains local, reflects fresh read without projecting any billing columns", async () => {
    for (const status of ["canceled", "paused"]) {
      setup(); linked("trialing"); subscription.status = status
      const profile = structuredClone(db.profile)
      await previews.preview(tenant, input())
      const result = await confirm()
      assert.equal(result.after.source, "admin_grant"); assert.equal(result.after.billingStatus, status)
      assert.deepEqual(db.profile, { ...profile, billingAccessVersion: 8 })
      assert.equal(providerReads, 8)
    }
  })
  test("Stripe-source confirmation explicitly dispatches to future saga; never creates fallback", async () => {
    linked("trialing")
    await previews.preview(tenant, input({ plan: undefined }))
    const original = db.snapshot(); db.writes = []
    await rejects(confirm, "trial_stripe_saga_required")
    assert.deepEqual(db.snapshot(), original); assert.deepEqual(db.writes, [])
  })
  test("provider read crossing TTL aborts before attempt audit", async () => {
    linked("canceled"); await previews.preview(tenant, input())
    readHook = () => { time = new Date(start.getTime() + 15 * 60000) }
    await rejects(confirm, "trial_preview_expired"); assert.equal(db.audits.length, 0)
  })
  for (const boundary of ["ttl", "session", "target"]) {
    test(`audit persistence crossing ${boundary} aborts before grant and rolls back attempt`, async () => {
      await previews.preview(tenant, input(boundary === "target" ? { days: undefined, expiresAt: "2026-10-20T00:01:00Z" } : {}))
      const original = db.snapshot(); db.writes = []
      db.afterAttempt = () => {
        if (boundary === "ttl") time = new Date(start.getTime() + 15 * 60000)
        if (boundary === "session") owner.adminSession.expiresAt = start
        if (boundary === "target") time = new Date("2026-10-20T00:01:00Z")
      }
      await rejects(confirm, boundary === "session" ? "trial_owner_required" : "trial_preview_expired", boundary === "session" ? 403 : 409)
      assert.deepEqual(db.snapshot(), original); assert.deepEqual(db.writes, ["audit.create"])
    })
  }
  test("short frozen target reached while audit persists is stale, never silently extended", async () => {
    db.profile.trialEndsAt = new Date("2026-10-01")
    await previews.preview(tenant, input({ days: undefined, expiresAt: "2026-10-16T00:01:00Z" }))
    const original = db.snapshot()
    db.afterAttempt = () => { time = new Date("2026-10-16T00:01:00Z") }
    await rejects(confirm, "trial_preview_stale"); assert.deepEqual(db.snapshot(), original)
  })
  for (const change of ["version", "grant", "risk", "customer-round-trip"]) {
    test(`changed ${change} after preview cannot confirm or write attempt`, async () => {
      currentGrant(); await previews.preview(tenant, input())
      if (change === "version") db.profile.billingAccessVersion = 8
      if (change === "grant") db.grants[0].plan = "essentials"
      if (change === "risk") db.risks.push({ userId: tenant, kind: "subscription_invoice", stripeStatus: "uncollectible", blocking: true })
      if (change === "customer-round-trip") { db.profile.pendingBillingMutationId = null; db.profile.billingAccessVersion = 9 }
      const original = db.snapshot(); db.writes = []
      await rejects(confirm, change === "risk" ? "trial_eligibility_unavailable" : "trial_preview_stale", change === "risk" ? 503 : 409)
      assert.deepEqual(db.snapshot(), original); assert.deepEqual(db.writes, [])
    })
  }
  test("fresh paid status blocks previously local intent without creating fallback", async () => {
    linked("canceled"); await previews.preview(tenant, input())
    subscription.status = "active"
    const original = db.snapshot(); db.writes = []
    await rejects(confirm, "trial_ineligible"); assert.deepEqual(db.snapshot(), original); assert.deepEqual(db.writes, [])
  })
  test("no authenticated context means no transaction or target lookup", async () => {
    const guarded = api.createTrialAccessOperationService({ transaction: db.transaction, now: () => time, stripe: provider,
      authorize: async () => { throw new Error("unauthenticated") } })
    await assert.rejects(() => guarded.confirm(tenant, confirmation(), request), /unauthenticated/)
    assert.equal(db.reads, 0); assert.equal(db.transactions, 0)
  })
  for (const state of ["platform_support", "platform_admin", "disabled", "expired", "revoked", "foreign_session", "foreign_role", "missing_session"]) {
    test(`${state} fails before any lookup`, async () => {
      if (state === "platform_support" || state === "platform_admin") owner.platformRole.role = state
      if (state === "disabled") owner.platformRole.status = "disabled"
      if (state === "expired") owner.adminSession.expiresAt = start
      if (state === "revoked") owner.adminSession.revokedAt = start
      if (state === "foreign_session") owner.adminSession.userId = "someone-else"
      if (state === "foreign_role") owner.platformRole.userId = "someone-else"
      if (state === "missing_session") owner.adminSession.id = ""
      await rejects(confirm, "trial_owner_required", 403)
      assert.equal(db.reads, 0); assert.equal(db.transactions, 0)
    })
  }
  for (const mismatch of ["tenant", "actor", "session"]) {
    test(`foreign ${mismatch} cannot confirm or replay, identical scoped 404`, async () => {
      await previews.preview(tenant, input())
      await confirm()
      if (mismatch === "tenant") { db.profiles.push({ ...db.profile, userId: foreign }); db.operations[0].userId = foreign }
      if (mismatch === "actor") db.operations[0].actorUserId = "another-owner"
      if (mismatch === "session") db.operations[0].adminSessionId = "another-session"
      const original = db.snapshot()
      await rejects(confirm, "trial_operation_not_found", 404)
      assert.deepEqual(db.snapshot(), original)
    })
  }
  test("static schema permits unique-row ID replacement without grant-history incoming FK or delete", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8")
    const grantModel = schema.split("model TenantTrialGrant {")[1].split("\n}")[0]
    assert.match(grantModel, /userId\s+String\s+@unique/)
    assert.match(grantModel, /creatorOperation[^\n]+fields: \[userId, creatorOperationId\]/)
    assert.match(grantModel, /lastOperation[^\n]+fields: \[userId, lastOperationId\]/)
    assert.ok(!schema.includes("references: [grantId]"))
    assert.ok(!schema.includes("fields: [grantId]"))
    assert.doesNotMatch(schema, /\bTenantTrialGrant\??\s+@relation\([^)]*fields:/, "no FK points into replaceable current grant ID")
    const source = readFileSync(new URL("../lib/billing/trialAccessOperations.ts", import.meta.url), "utf8")
    assert.ok(!source.includes("tenantTrialGrant.delete")); assert.ok(!source.includes("firstChasedAt:"))
    assert.ok(!source.includes(".subscriptions.update")); assert.ok(!source.includes(".emails.send"))
  })
})