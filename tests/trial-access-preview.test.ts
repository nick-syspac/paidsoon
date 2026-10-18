import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type Stripe from "stripe"
import type { AdminGuardContext } from "@/lib/admin/guard"
import type { Prisma, TenantTrialOperation, UserProfile } from "@/lib/generated/prisma/client"

type Row = Record<string, unknown>
const tenant = "11111111-1111-4111-8111-111111111111"
const other = "22222222-2222-4222-8222-222222222222"
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const secondId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const start = new Date("2026-10-16T00:00:00Z")
let api: typeof import("@/lib/billing/trialAccessPreview")
let service: ReturnType<typeof api.createTrialAccessPreviewService>
let time: Date
let owner: AdminGuardContext
let db: Database
let subscription: Row
let providerReads: string[]
let readHook: (() => void) | undefined
let providerFailure: boolean
let authorizations: number
let clientCreations: number

function input(overrides: Row = {}): Row {
  return { operationId, action: "extend_or_grant", days: 7, plan: "business_control",
    reason: "  Approved evaluation  ", timeZone: "Australia/Melbourne", expectedVersion: 7, ...overrides }
}
const confirm = (id = operationId, expectedVersion = 7) => ({ operationId: id, expectedVersion })
function grant(overrides: Row = {}): Row {
  return { id: "grant-1", userId: tenant, plan: "small_business", startsAt: new Date("2026-10-01"),
    expiresAt: new Date("2026-10-30"), revokedAt: null, creatorOperationId: secondId, lastOperationId: secondId, ...overrides }
}
function risk(overrides: Row = {}): Row {
  return { id: "risk-1", userId: tenant, kind: "subscription_invoice", stripeObjectId: "in_1",
    stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", stripeInvoiceId: "in_1", stripeChargeId: null,
    stripeStatus: "open", blocking: true, ...overrides }
}
function match(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value)
}
function select(row: Row | null, fields?: Row): Row | null {
  if (!row) return null
  return structuredClone(fields ? Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])) : row)
}

/** Only journal creation is exposed; access/audit/outbox/reservation writes fail. */
class Database {
  profiles: Row[] = [{
    userId: tenant, stripeCustomerId: null, stripeSubscriptionId: null, stripePriceId: null,
    subscriptionStatus: "trialing", subscriptionTier: "essentials", trialEndsAt: new Date("2026-10-20"),
    billingAccessVersion: 7, pendingTrialOperationId: null, pendingBillingMutationId: null,
    subscriptionCurrentPeriodStart: null, subscriptionCurrentPeriodEnd: null,
    subscriptionCancelAt: null, subscriptionCancelAtPeriodEnd: false, stripeScheduleId: null, pendingDowngradeTier: null,
  }]
  grants: Row[] = []
  risks: Row[] = []
  operations: TenantTrialOperation[] = []
  customers: Row[] = []
  active = false
  writes = 0
  reads = 0
  failCommit = false
  failCreate = false
  private tail = Promise.resolve()
  get profile(): Row { return this.profiles[0] }
  delegate(rows: () => Row[]) {
    return {
      findUnique: async ({ where, select: fields }: { where: Row; select?: Row }) => {
        assert.ok(this.active); this.reads++
        return select(rows().find((row) => match(row, where)) ?? null, fields)
      },
      findMany: async ({ where, select: fields }: { where: Row; select?: Row }) => {
        assert.ok(this.active); this.reads++
        return rows().filter((row) => match(row, where)).map((row) => select(row, fields))
      },
    }
  }
  transaction = async <T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    const previous = this.tail
    let release!: () => void
    this.tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    const original = structuredClone(this.operations)
    const tx = {
      $executeRawUnsafe: async (sql: string, key: string) => {
        assert.equal(sql, "SELECT pg_advisory_xact_lock(hashtext($1))")
        assert.ok(key === `billing-access:${tenant}` || key === `billing-access:${other}`)
        this.active = true
      },
      userProfile: this.delegate(() => this.profiles),
      tenantTrialGrant: this.delegate(() => this.grants),
      tenantBillingRisk: this.delegate(() => this.risks),
      tenantBillingMutation: this.delegate(() => this.customers),
      tenantTrialOperation: {
        ...this.delegate(() => this.operations as unknown as Row[]),
        create: async ({ data }: { data: Row }) => {
          assert.ok(this.active); this.writes++
          if (this.failCreate) throw new Error("private persistence failure")
          assert.ok(!this.operations.some((op) => op.id === data.id))
          const row = { result: null, attempts: 0, leaseOwner: null, leaseExpiresAt: null,
            fencingToken: 0, createdAt: time, updatedAt: time, ...structuredClone(data) } as unknown as TenantTrialOperation
          this.operations.push(row)
          return structuredClone(row)
        },
      },
    }
    try {
      const result = await run(tx as unknown as Prisma.TransactionClient)
      if (this.failCommit) throw new Error("private commit failure")
      return result
    } catch (error) { this.operations = original; throw error }
    finally { this.active = false; release() }
  }
}

function provider(): Stripe {
  const read = (method: string): void => {
    assert.ok(db.active, "fresh provider reads hold the tenant lock")
    providerReads.push(method)
    readHook?.()
    if (providerFailure) throw new Error("private upstream details")
  }
  const page = (method: string, data: Row[]) => { read(method); return { data, has_more: false } }
  return {
    customers: { retrieve: async () => { read("customer"); return { id: "cus_1", metadata: {} } } },
    subscriptions: {
      list: async () => page("subscriptions", [subscription]),
      retrieve: async () => { read("subscription"); return structuredClone(subscription) },
    },
    invoices: { list: async () => page("invoices", []) },
    charges: { list: async () => page("charges", []) },
  } as unknown as Stripe
}
function linked(status = "trialing"): void {
  Object.assign(db.profile, { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: status })
  subscription.status = status
}
function setup(): void {
  time = new Date(start)
  owner = {
    userId: "owner-1", userEmail: "owner@example.test",
    platformRole: { userId: "owner-1", role: "platform_owner", status: "active" },
    adminSession: { id: "session-1", userId: "owner-1", revokedAt: null, expiresAt: new Date("2027-01-01") },
  } as AdminGuardContext
  db = new Database()
  providerReads = []; providerFailure = false; readHook = undefined; authorizations = 0; clientCreations = 0
  subscription = {
    id: "sub_1", customer: "cus_1", metadata: {}, status: "trialing",
    items: { has_more: false, data: [{ quantity: 1, price: { id: "price_control", type: "recurring", recurring: { usage_type: "licensed" } } }] },
    trial_end: Date.parse("2026-10-21") / 1000, trial_start: start.getTime() / 1000,
    billing_cycle_anchor: start.getTime() / 1000, latest_invoice: null, cancel_at: null, cancel_at_period_end: false,
    schedule: null, pending_update: null, pause_collection: null, pending_invoice_item_interval: null,
    next_pending_invoice_item_invoice: null,
  }
  service = api.createTrialAccessPreviewService({ transaction: db.transaction, now: () => time,
    authorize: async () => { authorizations++; return owner },
    stripe: () => { clientCreations++; return provider() },
  })
}
async function rejects(run: () => Promise<unknown>, code: string, status = 409): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof api.TrialPreviewError && error.code === code && error.status === status)
}

before(async () => {
  mock.module("server-only", { namedExports: {} })
  mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: new Proxy({}, { get() { throw new Error("live DB forbidden") } }) } })
  mock.module("@/lib/admin/guard", { namedExports: { requireAdminElevation: async () => { throw new Error("unmocked auth forbidden") } } })
  mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: () => { throw new Error("live provider forbidden") } } })
  process.env.STRIPE_SOLO_PRICE_ID = "price_control"
  api = await import("@/lib/billing/trialAccessPreview")
})
beforeEach(setup)

describe("persisted owner trial previews — task 4.2", () => {
  test("persists immutable normalized input/hash, owner/session, safe sources, frozen UTC target and exactly 15-minute TTL", async () => {
    const before = structuredClone(db.profiles)
    const result = await service.preview(tenant, input())
    assert.equal(result.target?.expiresAt, "2026-10-27T00:00:00.000Z")
    assert.equal(result.target?.localExpiresAt, "2026-10-27T11:00:00+11:00")
    assert.equal(result.previewExpiresAt, "2026-10-16T00:15:00.000Z")
    assert.equal(result.previous.source, "onboarding_trial")
    assert.equal(result.previous.billingPlan, "essentials")
    assert.equal(result.source, "admin_grant")
    assert.equal(result.targetPlan, "business_control")
    const op = db.operations[0]
    assert.equal(op.actorUserId, "owner-1"); assert.equal(op.adminSessionId, "session-1")
    assert.match(op.inputHash, /^[a-f0-9]{64}$/); assert.match(op.previewFingerprint, /^[a-f0-9]{64}$/)
    assert.equal(op.reason, "Approved evaluation"); assert.equal(op.notify, false)
    assert.equal((op.normalizedInput as Row).reason, op.reason)
    assert.deepEqual(db.profiles, before)
    assert.equal(db.writes, 1); assert.equal(clientCreations, 0)
    assert.equal(op.status, "previewed"); assert.equal(op.attempts, 0); assert.equal(op.leaseOwner, null)
    const safe = JSON.stringify(result)
    for (const secret of [tenant, "owner-1", "session-1", "cus_1", "sub_1", "Approved evaluation", op.inputHash, op.previewFingerprint]) assert.ok(!safe.includes(secret))
  })

  test("identical duration replay precedes changed now/version/reservation and preserves the original TTL/target", async () => {
    const first = await service.preview(tenant, input())
    const row = structuredClone(db.operations[0])
    time = new Date(start.getTime() + 10 * 60000)
    db.profile.billingAccessVersion = 90; db.profile.pendingBillingMutationId = secondId
    const replay = await service.preview(tenant, input({ reason: "Approved evaluation", notify: false, operationId: operationId.toUpperCase() }))
    assert.deepEqual(replay, first)
    assert.deepEqual(db.operations[0], row); assert.equal(db.writes, 1); assert.equal(authorizations, 2)
  })

  for (const delta of [15 * 60000, 15 * 60000 + 1, 24 * 3600000]) {
    test(`expired replay at +${delta}ms has expired status and never refreshes expiry or journal`, async () => {
      const first = await service.preview(tenant, input())
      const row = structuredClone(db.operations[0])
      time = new Date(start.getTime() + delta)
      const replay = await service.preview(tenant, input())
      assert.equal(replay.status, "expired_preview")
      assert.deepEqual(replay.target, first.target); assert.equal(replay.previewExpiresAt, first.previewExpiresAt)
      assert.deepEqual(db.operations[0], row)
      await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_expired")
    })
  }

  test("confirmation strictly before TTL returns the exact displayed expiry, without recalculating days", async () => {
    db.profile.trialEndsAt = new Date("2026-10-01")
    const preview = await service.preview(tenant, input())
    time = new Date(start.getTime() + 15 * 60000 - 1)
    const validated = await service.validateConfirmation(tenant, confirm())
    assert.deepEqual(validated.preview.target, preview.target)
    assert.equal(validated.operation.targetExpiresAt?.toISOString(), preview.target?.expiresAt)
    assert.equal(db.writes, 1)
  })

  for (const status of ["succeeded", "failed", "pending", "reconciliation_required", "conflicted", "expired_preview"] as const) {
    test(`${status} UUID replay never overwrites result, input, status or absolute expiry after TTL`, async () => {
      await service.preview(tenant, input())
      db.operations[0].status = status
      db.operations[0].result = { original: true }
      const row = structuredClone(db.operations[0])
      time = new Date(start.getTime() + 3600000)
      const replay = await service.preview(tenant, input())
      assert.equal(replay.status, status); assert.deepEqual(db.operations[0], row)
      await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_not_confirmable")
    })
  }

  for (const changes of [{ days: 14 }, { reason: "Changed reason" }, { plan: "business_pro" }, { notify: true },
    { timeZone: "UTC" }, { expectedVersion: 8 }, { action: "revoke_grant", days: undefined, plan: undefined }]) {
    test(`changed immutable input conflicts without leak: ${JSON.stringify(changes)}`, async () => {
      await service.preview(tenant, input())
      const row = structuredClone(db.operations[0])
      // Revocation's strict schema correctly rejects extension-only keys.
      const raw = changes.action ? { operationId, action: "revoke_grant", reason: "Approved evaluation", timeZone: "Australia/Melbourne", expectedVersion: 7 } : input(changes)
      await rejects(() => service.preview(tenant, raw), "trial_operation_key_conflict")
      assert.deepEqual(db.operations[0], row)
    })
  }

  for (const mismatch of ["tenant", "actor", "session"]) {
    test(`UUID reuse under another ${mismatch} conflicts; foreign confirmation is indistinguishable from missing`, async () => {
      await service.preview(tenant, input())
      let target = tenant
      if (mismatch === "tenant") { db.profiles.push({ ...db.profile, userId: other }); target = other }
      if (mismatch === "actor") { owner.userId = "owner-2"; owner.platformRole.userId = "owner-2"; owner.adminSession.userId = "owner-2" }
      if (mismatch === "session") owner.adminSession.id = "session-2"
      await rejects(() => service.preview(target, input()), "trial_operation_key_conflict")
      await rejects(() => service.validateConfirmation(target, confirm()), "trial_operation_not_found", 404)
      await rejects(() => service.validateConfirmation(target, confirm(secondId)), "trial_operation_not_found", 404)
    })
  }

  test("cross-journal UUID cannot become an owner preview", async () => {
    db.customers.push({ id: operationId, userId: other })
    await rejects(() => service.preview(tenant, input()), "trial_operation_key_conflict")
    assert.equal(db.writes, 0)
  })

  test("concurrent identical preview persists once; different input under the same UUID conflicts", async () => {
    const [first, replay] = await Promise.all([service.preview(tenant, input()), service.preview(tenant, input())])
    assert.deepEqual(first, replay); assert.equal(db.writes, 1)
    await rejects(() => service.preview(tenant, input({ days: 30 })), "trial_operation_key_conflict")
  })

  test("fresh preflight reads override stale local Stripe dates while retaining longer independent grant expiry", async () => {
    linked(); db.grants.push(grant())
    const preview = await service.preview(tenant, input({ plan: undefined }))
    assert.equal(preview.source, "stripe_trial"); assert.equal(preview.targetPlan, "business_control")
    assert.equal(preview.previous.stripeTrialEndsAt, "2026-10-21T00:00:00.000Z")
    assert.equal(preview.previous.effectiveExpirySource, "admin_grant")
    assert.equal(preview.previous.effectiveExpiryPlan, "small_business")
    assert.equal(preview.target?.expiresAt, "2026-11-06T00:00:00.000Z")
    assert.equal(preview.billingEffect, "stripe_first_billing_timing")
    time = new Date(start.getTime() + 60000)
    const confirmed = await service.validateConfirmation(tenant, confirm())
    assert.deepEqual(confirmed.preview, preview)
    assert.equal(providerReads.length, 10)
  })

  for (const status of ["active", "past_due", "unpaid", "incomplete", "incomplete_expired"]) {
    test(`fresh Stripe ${status} rejects granting/extension despite eligible stale local status`, async () => {
      linked(); subscription.status = status
      await rejects(() => service.preview(tenant, input()), "trial_ineligible")
      assert.equal(db.writes, 0)
    })
  }
  test("unsupported Stripe trial never silently becomes an application grant", async () => {
    linked(); subscription.schedule = "sched_1"
    await rejects(() => service.preview(tenant, input()), "trial_ineligible")
  })
  for (const status of ["canceled", "paused"]) {
    test(`fresh ${status} removes stale local Stripe-trial timing from the effective snapshot and extension base`, async () => {
      linked(); db.profile.trialEndsAt = new Date("2027-01-01"); subscription.status = status
      const preview = await service.preview(tenant, input())
      assert.equal(preview.source, "admin_grant")
      assert.equal(preview.previous.source, "none")
      assert.equal(preview.previous.billingStatus, status)
      assert.equal(preview.previous.effectiveTrialExpiresAt, null)
      assert.equal(preview.target?.expiresAt, "2026-10-23T00:00:00.000Z")
      assert.equal(db.profile.subscriptionStatus, "trialing", "preview never projects provider reads")
    })
  }
  test("Stripe extension forbids plan while application grant requires public plan", async () => {
    linked()
    await assert.rejects(() => service.preview(tenant, input()), { name: "ZodError" })
    setup()
    await assert.rejects(() => service.preview(tenant, input({ plan: undefined })), { name: "ZodError" })
  })
  for (const plan of ["starter", "solo", "accountant_partner", "unknown"]) {
    test(`rejects nonpublic/alias plan ${plan}`, async () => {
      await assert.rejects(() => service.preview(tenant, input({ plan })), { name: "ZodError" })
      assert.equal(db.writes, 0); assert.equal(clientCreations, 0)
    })
  }
  test("all four public grant plans preserve their predicted plan", async () => {
    for (const plan of ["essentials", "business_control", "small_business", "business_pro"]) {
      setup()
      assert.equal((await service.preview(tenant, input({ plan }))).targetPlan, plan)
    }
  })
  test("explicit offset expiry normalizes before hashing and remains unchanged at confirmation", async () => {
    const first = await service.preview(tenant, input({ days: undefined, expiresAt: "2026-10-30T11:00:00.999+11:00" }))
    const replay = await service.preview(tenant, input({ days: undefined, expiresAt: "2026-10-30T00:00:00Z" }))
    assert.deepEqual(replay, first)
    assert.equal(first.target?.expiresAt, "2026-10-30T00:00:00.000Z")
    await rejects(() => service.preview(tenant, input({ days: undefined, expiresAt: "2026-10-31T00:00:00Z" })), "trial_operation_key_conflict")
  })
  test("expired onboarding uses max(now,effective expiry) at second precision", async () => {
    db.profile.trialEndsAt = new Date("2026-10-01")
    time = new Date(start.getTime() + 987)
    const preview = await service.preview(tenant, input())
    assert.equal(preview.target?.expiresAt, "2026-10-23T00:00:00.000Z")
  })
  for (const expiresAt of ["2026-10-20T00:00:00Z", "2029-01-01T00:00:00Z"]) {
    test(`rejects nonextending or unsafe-horizon target ${expiresAt}`, async () => {
      await rejects(() => service.preview(tenant, input({ days: undefined, expiresAt })), "trial_expiry_invalid", 400)
    })
  }

  test("known risk cannot disappear from fresh lists and allow a new grant", async () => {
    linked("canceled"); db.risks.push(risk())
    await rejects(() => service.preview(tenant, input()), "trial_eligibility_unavailable", 503)
    assert.equal(db.writes, 0)
  })
  test("provider failure is safely unavailable and never persists a fallback", async () => {
    linked(); providerFailure = true
    await rejects(() => service.preview(tenant, input({ plan: undefined })), "trial_eligibility_unavailable", 503)
    assert.equal(db.writes, 0)
  })

  for (const status of ["active", "past_due", "unpaid", "incomplete", "unknown"]) {
    test(`revoke is permitted under ${status}, even with no customer, known risk or failed provider`, async () => {
      db.profile.subscriptionStatus = status
      db.risks.push(risk()); db.grants.push(grant()); providerFailure = true
      const raw = { operationId, action: "revoke_grant", reason: "Remove temporary grant", timeZone: "UTC", expectedVersion: 7 }
      const result = await service.preview(tenant, raw)
      assert.equal(result.action, "revoke_grant"); assert.equal(result.target, null); assert.equal(result.targetPlan, null)
      assert.equal(result.billingEffect, "grant_removal_only")
      await service.validateConfirmation(tenant, confirm())
      assert.equal(clientCreations, 0)
      assert.equal(db.grants[0].revokedAt, null)
    })
  }
  test("linked paid revocation preserves independent access even when Stripe is unavailable", async () => {
    linked("active"); db.grants.push(grant()); providerFailure = true
    const result = await service.preview(tenant, { operationId, action: "revoke_grant", reason: "Remove grant", timeZone: "UTC", expectedVersion: 7 })
    assert.equal(result.previous.source, "paid"); assert.equal(result.previous.allowAccess, true)
    assert.equal(clientCreations, 0)
  })
  for (const state of ["missing", "revoked", "expired"]) {
    test(`revocation reports ${state} current grant without creating access`, async () => {
      if (state !== "missing") db.grants.push(grant(state === "revoked" ? { revokedAt: start } : { expiresAt: new Date("2026-10-01") }))
      const raw = { operationId, action: "revoke_grant", reason: "Remove grant", timeZone: "UTC", expectedVersion: 7 }
      if (state === "expired") assert.equal((await service.preview(tenant, raw)).status, "previewed")
      else await rejects(() => service.preview(tenant, raw), "trial_grant_not_current")
    })
  }

  for (const field of ["pendingTrialOperationId", "pendingBillingMutationId"]) {
    test(`${field} blocks fresh preview and confirmation regardless of lease expiry`, async () => {
      await service.preview(tenant, input())
      db.profile[field] = secondId
      await assert.rejects(() => service.preview(tenant, input({ operationId: secondId })), { name: "TenantBillingConflictError" })
      await assert.rejects(() => service.validateConfirmation(tenant, confirm()), { name: "TenantBillingConflictError" })
      assert.equal(db.writes, 1)
    })
  }
  test("customer reserve/release advances monotonic version and invalidates otherwise identical state", async () => {
    await service.preview(tenant, input())
    db.profile.pendingBillingMutationId = secondId
    db.profile.billingAccessVersion = 8
    db.profile.pendingBillingMutationId = null
    db.profile.billingAccessVersion = 9
    await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_stale")
    await rejects(() => service.preview(tenant, input({ operationId: secondId })), "trial_preview_stale")
    assert.equal((await service.preview(tenant, input({ operationId: secondId, expectedVersion: 9 }))).previewVersion, 9)
  })
  test("confirmation rejects mismatched supplied expectedVersion", async () => {
    await service.preview(tenant, input())
    await rejects(() => service.validateConfirmation(tenant, confirm(operationId, 6)), "trial_preview_stale")
  })
  for (const mutation of ["grant_identity", "grant_plan", "grant_expiry", "grant_revoked", "risk_identity", "binding", "billing", "provider"]) {
    test(`fingerprint rejects changed ${mutation} even without a version increment`, async () => {
      linked(); db.grants.push(grant())
      if (mutation === "risk_identity") db.risks.push(risk({ stripeStatus: "paid", blocking: false }))
      if (mutation === "risk_identity") {
        // Revoke fingerprints local risk identity without requiring an invoice fixture.
        await service.preview(tenant, { operationId, action: "revoke_grant", reason: "Remove grant", timeZone: "UTC", expectedVersion: 7 })
      } else await service.preview(tenant, input({ plan: undefined }))
      if (mutation === "grant_identity") db.grants[0].id = "replacement-grant"
      if (mutation === "grant_plan") db.grants[0].plan = "business_pro"
      if (mutation === "grant_expiry") db.grants[0].expiresAt = new Date("2026-11-01")
      if (mutation === "grant_revoked") db.grants[0].revokedAt = start
      if (mutation === "risk_identity") db.risks[0].stripeObjectId = "in_other"
      if (mutation === "binding") db.profile.stripePriceId = "another-price"
      if (mutation === "billing") db.profile.subscriptionCurrentPeriodEnd = new Date("2026-12-01")
      if (mutation === "provider") subscription.trial_end = Date.parse("2026-10-22") / 1000
      await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_stale")
    })
  }
  test("fresh confirmation rechecks eligibility source instead of trusting stored grant intent", async () => {
    linked("canceled")
    await service.preview(tenant, input())
    subscription.status = "trialing"
    await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_stale")
  })
  test("time alone expiring an independent grant invalidates the effective-source fingerprint", async () => {
    db.grants.push(grant({ expiresAt: new Date(start.getTime() + 60000) }))
    await service.preview(tenant, input())
    time = new Date(start.getTime() + 60000)
    await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_stale")
  })
  test("overdue authoritative Stripe trial does not become spuriously stale as server now advances", async () => {
    linked(); subscription.trial_end = start.getTime() / 1000 - 60000
    const first = await service.preview(tenant, input({ plan: undefined }))
    assert.equal(first.previous.trialTimingPendingReconciliation, true)
    time = new Date(start.getTime() + 60000)
    assert.deepEqual((await service.validateConfirmation(tenant, confirm())).preview.target, first.target)
  })
  test("TTL is checked again after slow provider reads", async () => {
    linked()
    await service.preview(tenant, input({ plan: undefined }))
    readHook = () => { time = new Date(start.getTime() + 15 * 60000) }
    await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_expired")
  })
  test("expiry that becomes past before confirmation is never moved forward", async () => {
    db.profile.trialEndsAt = new Date("2026-10-01")
    const first = await service.preview(tenant, input({ days: undefined, expiresAt: "2026-10-16T00:01:00Z" }))
    time = new Date(start.getTime() + 60000)
    await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_stale")
    assert.equal(db.operations[0].targetExpiresAt?.toISOString(), first.target?.expiresAt)
  })
  test("corrupted normalized journal input is not a confirmable capability", async () => {
    await service.preview(tenant, input())
    db.operations[0].normalizedInput = { ...db.operations[0].normalizedInput as Row, days: 30 } as Prisma.JsonObject
    await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_preview_corrupt", 503)
  })

  for (const state of ["support", "admin", "disabled", "expired", "revoked", "foreign_session", "missing_session"]) {
    test(`${state} owner context fails before any tenant read`, async () => {
      if (state === "support") owner.platformRole.role = "platform_support"
      if (state === "admin") owner.platformRole.role = "platform_admin"
      if (state === "disabled") owner.platformRole.status = "disabled"
      if (state === "expired") owner.adminSession.expiresAt = start
      if (state === "revoked") owner.adminSession.revokedAt = start
      if (state === "foreign_session") owner.adminSession.userId = "another-owner"
      if (state === "missing_session") owner.adminSession.id = ""
      await rejects(() => service.preview(tenant, input()), "trial_owner_required", 403)
      assert.equal(db.reads, 0)
    })
  }
  test("authorization failure propagates without tenant reads", async () => {
    const guarded = api.createTrialAccessPreviewService({ transaction: db.transaction, now: () => time,
      stripe: provider, authorize: async () => { throw new Error("unauthenticated") } })
    await assert.rejects(() => guarded.preview(tenant, input()), /unauthenticated/)
    assert.equal(db.reads, 0)
  })
  test("missing tenant and missing operation are scoped not-found", async () => {
    await rejects(() => service.preview(other, input()), "trial_tenant_not_found", 404)
    await rejects(() => service.validateConfirmation(tenant, confirm()), "trial_operation_not_found", 404)
    assert.equal(db.writes, 0)
  })
  for (const fault of ["failCreate", "failCommit"] as const) {
    test(`${fault} returns sanitized unavailable with no persisted preview or access mutation`, async () => {
      db[fault] = true
      const profiles = structuredClone(db.profiles)
      await rejects(() => service.preview(tenant, input()), "trial_preview_unavailable", 503)
      assert.deepEqual(db.operations, []); assert.deepEqual(db.profiles, profiles)
    })
  }
  test("same-transaction validation seam can be reused under the shared lock without an acceptance write", async () => {
    const preview = await service.preview(tenant, input())
    const result = await db.transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `billing-access:${tenant}`)
      return service.validateConfirmationInTransaction(tx, structuredClone(db.profile) as unknown as UserProfile, owner, confirm())
    })
    assert.deepEqual(result.preview, preview); assert.equal(db.writes, 1)
  })
})