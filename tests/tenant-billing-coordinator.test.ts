import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type Stripe from "stripe"
import { WebhookLedgerMock } from "@/tests/helpers/webhookLedgerMock"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"

type Profile = {
  userId: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null;
  stripeScheduleId: string | null; pendingDowngradeTier: string | null;
  billingAccessVersion: number; pendingTrialOperationId: string | null; pendingBillingMutationId: string | null;
  subscriptionStatus: string; subscriptionTier: string; trialEndsAt: Date | null;
  latestStripeEventCreatedAt: Date | null;
}
let api: typeof import("@/lib/billing/tenantBillingCoordinator")
let hostedApi: typeof import("@/lib/billing/hostedCheckoutLifecycle")
let riskApi: typeof import("@/lib/billing/riskReconciliation")
let profile: Profile
let ledger: WebhookLedgerMock
let provider: Record<string, unknown>
let risks: Record<string, unknown>[]
let history: string[]
let writes: Record<string, unknown>[]
let locked: boolean
let tail: Promise<void>
let onRead: (() => Promise<void>) | undefined
let failProfile: boolean
let operation: Record<string, unknown> | null
let session: Record<string, unknown>
let subscriptionOverrides: Record<string, Record<string, unknown>>
let subscriptionPages: { data: Record<string, unknown>[]; has_more: boolean }[]
let listCalls: Record<string, unknown>[]
let creationStep: Record<string, unknown> | null
const grant = {
  id: "grant", plan: "small_business", startsAt: new Date("2026-10-01"),
  expiresAt: new Date("2026-11-01"), revokedAt: null,
}
const invoices = ["pending", "snoozed", "paused", "resolved"].map((status, index) => ({
  id: `invoice_${index}`, status, nextEmailAt: new Date("2026-10-16"),
  firstChasedAt: new Date("2026-10-02"), stage: index,
}))
const providerInvoice = {
  id: "in_debt", customer: "cus_1", metadata: {}, status: "uncollectible", amount_remaining: 100,
  attempt_count: 1, due_date: null,
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: {} } },
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => { resolve = yes })
  return { promise, resolve }
}
async function operationCas({ where }: { where: Record<string, unknown> }): Promise<{ count: number }> {
  assert.ok(locked); history.push("operation-fence")
  const matches = operation && Object.entries(where).every(([key, expected]) => {
    if (key === "status") return (expected as { in: unknown[] }).in.includes(operation?.status)
    if (key === "leaseExpiresAt") return operation?.leaseExpiresAt instanceof Date && operation.leaseExpiresAt > (expected as { gt: Date }).gt
    return operation?.[key] === expected
  })
  return { count: matches ? 1 : 0 }
}
function webhook(id = "evt_1", created = 100): Extract<Parameters<typeof api.reconcileTenantSubscription>[3], { kind: "webhook" }> {
  ledger.seed(id, "processing", { processingToken: `token_${id}`, processingLeaseUntil: new Date("2100-01-01") })
  return { kind: "webhook", claim: { stripeEventId: id, token: `token_${id}` }, eventCreatedAt: new Date(created * 1000) }
}
const stripe = {
  checkout: { sessions: { retrieve: async (id: string) => {
    assert.ok(locked, "session read must be under tenant lock")
    return structuredClone({ ...session, id })
  } } },
  subscriptions: { retrieve: async (id: string) => {
    assert.ok(locked, "authoritative subscription read must be under the tenant lock")
    history.push(`read:${id}:${provider.status}`)
    const snapshot = structuredClone({ ...provider, ...subscriptionOverrides[id], id })
    await onRead?.()
    return snapshot
  }, list: async (params: Record<string, unknown>) => {
    assert.ok(locked); listCalls.push(params)
    return subscriptionPages.shift() ?? { data: [], has_more: false }
  } },
  customers: { retrieve: async () => ({ id: "cus_1", metadata: {} }) },
  invoices: { retrieve: async () => structuredClone(providerInvoice) },
  subscriptionSchedules: { retrieve: async (id: string) => ({
    id, customer: "cus_1", status: "released", released_subscription: "sub_1", metadata: {},
  }) },
} as unknown as Stripe

describe("shared tenant billing coordinator (transaction/lock/CAS mocks, no live services)", () => {
  before(async () => {
    process.env.STRIPE_SOLO_PRICE_ID = "price_control"
    await mock.module("server-only", { namedExports: {} })
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
      userProfile: { findFirst: async () => structuredClone(profile) },
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        let release: (() => void) | undefined
        let beforeProfile: Profile | undefined
        let beforeRisks: Record<string, unknown>[] | undefined
        let beforeWrites = 0
        const tx = {
          $executeRawUnsafe: async (sql: string, key: string) => {
            assert.equal(sql, "SELECT pg_advisory_xact_lock(hashtext($1))")
            assert.equal(key, "billing-access:tenant")
            const previous = tail
            const gate = deferred(); tail = gate.promise; release = gate.resolve
            await previous
            locked = true; history.push("lock")
            beforeProfile = structuredClone(profile); beforeRisks = structuredClone(risks); beforeWrites = writes.length
          },
          userProfile: {
            findUnique: async () => { assert.ok(locked); return structuredClone(profile) },
            findFirst: async () => null,
            update: async ({ data }: { data: Record<string, unknown> }) => {
              assert.ok(locked); history.push("projection")
              if (failProfile) throw new Error("mock projection failure")
              const { billingAccessVersion, ...projection } = data
              assert.deepEqual(billingAccessVersion, { increment: 1 })
              Object.assign(profile, projection); profile.billingAccessVersion++
              writes.push(data)
            },
          },
          stripeBillingWebhookEvent: { updateMany: async (args: Parameters<typeof ledger.delegate.updateMany>[0]) => {
            assert.ok(locked, "tenant lock must precede event fence")
            history.push(args.data.processingStatus ? "terminal" : "event-fence")
            return ledger.delegate.updateMany(args)
          } },
          tenantTrialOperation: { updateMany: operationCas },
          tenantBillingMutation: { updateMany: operationCas, findUnique: async () => structuredClone(operation) },
          tenantBillingMutationStep: { findUnique: async () => structuredClone(creationStep) },
          tenantBillingRisk: {
            findUnique: async () => null,
            upsert: async ({ create }: { create: Record<string, unknown> }) => { history.push("risk"); risks.push(create) },
          },
          // Any destructive access to these models fails the test immediately.
          trackedInvoice: new Proxy({}, { get: () => { throw new Error("invoice state must be untouched") } }),
          tenantTrialGrant: new Proxy({}, { get: () => { throw new Error("grant must be untouched") } }),
        }
        try { return await run(tx) }
        catch (error) {
          if (beforeProfile) { profile = beforeProfile; risks = beforeRisks!; writes.length = beforeWrites }
          throw error
        } finally { locked = false; release?.() }
      },
    } } })
    api = await import("@/lib/billing/tenantBillingCoordinator")
    hostedApi = await import("@/lib/billing/hostedCheckoutLifecycle")
    riskApi = await import("@/lib/billing/riskReconciliation")
  })
  beforeEach(() => {
    profile = {
      userId: "tenant", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
      stripeScheduleId: null, pendingDowngradeTier: null,
      billingAccessVersion: 7, pendingTrialOperationId: null, pendingBillingMutationId: null, subscriptionStatus: "trialing",
      subscriptionTier: "business_control", trialEndsAt: new Date(2000000000000),
      latestStripeEventCreatedAt: new Date(500000),
    }
    provider = {
      id: "sub_1", customer: "cus_1", metadata: {}, status: "trialing", trial_end: 2000000000,
      items: { data: [{ price: { id: "price_control" } }], has_more: false },
      cancel_at: null, cancel_at_period_end: false, latest_invoice: null,
    }
    ledger = new WebhookLedgerMock(); history = []; risks = []; writes = []; locked = false
    tail = Promise.resolve(); onRead = undefined; failProfile = false; operation = null
    session = { id: "cs_1", customer: "cus_1", subscription: "sub_1", metadata: {},
      mode: "subscription", status: "complete", payment_status: "paid", created: 1800000000 }
    subscriptionOverrides = {}; subscriptionPages = []; listCalls = []; creationStep = null
  })

  const hosted = () => hostedApi.reconcileHostedCheckout(stripe, "tenant", "cs_1", { kind: "hosted_lifecycle" })
  function correlatedCreation(): void {
    const id = "12345678-1234-4234-8234-123456789abc"
    session.metadata = { userId: "tenant", user_id: "tenant", operationId: id }
    provider.metadata = { userId: "tenant", user_id: "tenant", operationId: id }
    operation = { id, userId: "tenant", actorUserId: "tenant", action: "checkout_create", parentMutationId: null,
      status: "succeeded", startingBinding: { stripeCustomerId: "cus_1", stripeSubscriptionId: null },
      startingVersion: 4, executionVersion: 5, stripeCustomerId: "cus_1", stripeSessionId: "cs_1",
      stripeSubscriptionId: null,
      result: { url: "https://checkout.stripe.test/created" } }
    creationStep = { userId: "tenant", mutationId: id, firstAttemptAt: new Date(0), status: "succeeded", stripeSessionId: "cs_1",
      normalizedRequest: { customer: "cus_1", mode: "subscription", metadata: { userId: "tenant", operationId: id },
        subscription_data: { metadata: { userId: "tenant", operationId: id } } } }
  }
  test("hosted legacy completion uses verified customer mapping without inventing an operation", async () => {
    profile.stripeSubscriptionId = null; provider.status = "active"
    const result = await hosted()
    assert.equal(result.kind, "current"); assert.equal(profile.stripeSubscriptionId, "sub_1")
    assert.equal(profile.billingAccessVersion, 8); assert.equal(operation, null)
  })
  test("same-session callback/webhook replay verifies truth without changing immutable creation or version again", async () => {
    correlatedCreation(); profile.stripeSubscriptionId = null; provider.status = "active"
    const original = structuredClone(operation)
    await hosted(); const version = profile.billingAccessVersion
    await hostedApi.reconcileHostedCheckout(stripe, "tenant", "cs_1", webhook("evt_hosted_replay"))
    assert.equal(profile.billingAccessVersion, version); assert.equal(writes.length, 1)
    assert.deepEqual(operation, original); assert.equal(ledger.rows.get("evt_hosted_replay")?.processingStatus, "processed")
  })
  test("completed no-payment-required trial projects actual trial rather than paid state", async () => {
    profile.stripeSubscriptionId = null; session.payment_status = "no_payment_required"
    provider.trial_start = 1800000001; provider.trial_end = 1800000100
    await hosted()
    assert.equal(profile.subscriptionStatus, "trialing"); assert.deepEqual(profile.trialEndsAt, new Date(1800000100000))
  })
  for (const invalid of [
    { mode: "payment" }, { payment_status: "unpaid" }, { customer: "cus_foreign" },
    { metadata: { userId: "tenant", user_id: "foreign" } }, { subscription: null },
    { payment_status: "no_payment_required" },
  ]) test(`hosted completion rejects invalid session evidence ${JSON.stringify(invalid)}`, async () => {
    Object.assign(session, invalid)
    await assert.rejects(hosted()); assert.equal(writes.length, 0)
  })
  test("open session is not subscription completion and cannot write lifecycle state", async () => {
    session.status = "open"
    assert.equal((await hosted()).kind, "incomplete"); assert.equal(writes.length, 0)
  })
  for (const reservation of ["pendingTrialOperationId", "pendingBillingMutationId"] as const) {
    test(`delayed completion preserves ${reservation}, creation result, grants and independent blocking risk`, async () => {
      correlatedCreation(); profile.stripeSubscriptionId = null; profile[reservation] = "newer-operation"
      provider.status = "active"; risks.push({ id: "independent-debt", blocking: true })
      const before = structuredClone({ operation, risks, grant, invoices })
      await hosted()
      assert.equal(profile.subscriptionStatus, "active"); assert.equal(profile.stripeSubscriptionId, "sub_1")
      assert.equal(profile[reservation], "newer-operation"); assert.equal(profile.billingAccessVersion, 8)
      assert.deepEqual({ operation, risks, grant, invoices }, before)
      assert.ok(writes.every((write) => !("pendingTrialOperationId" in write) && !("pendingBillingMutationId" in write)))
    })
  }
  test("lifecycle version increment rejects a stale preview version through the shared boundary", async () => {
    profile.stripeSubscriptionId = null; provider.status = "active"
    const previewVersion = profile.billingAccessVersion
    await hosted()
    await assert.rejects(api.coordinateTenantBilling("tenant", { kind: "direct", expectedVersion: previewVersion }, async () => {
      assert.fail("stale preview must not run"); return { result: undefined }
    }), { code: "billing_version_conflict" })
  })
  test("competing live subscriptions on a later page fail instead of selecting the first", async () => {
    profile.stripeSubscriptionId = null
    subscriptionPages = [
      { data: [{ ...provider, id: "sub_1" }], has_more: true },
      { data: [{ ...provider, id: "sub_competing" }], has_more: false },
    ]
    await assert.rejects(hosted()); assert.equal(writes.length, 0)
    assert.equal(listCalls.length, 2); assert.equal(listCalls[1].starting_after, "sub_1")
  })
  test("different bound subscription is verified even when missing from subscription enumeration", async () => {
    profile.stripeSubscriptionId = "sub_new"; provider.status = "canceled"
    subscriptionOverrides.sub_new = { status: "active" }
    const result = await hostedApi.reconcileHostedCheckout(stripe, "tenant", "cs_1", webhook("evt_obsolete_checkout"))
    assert.equal(result.kind, "superseded"); assert.equal(writes.length, 0)
    assert.ok(history.some((value) => value.startsWith("read:sub_new:")))
    assert.equal(ledger.rows.get("evt_obsolete_checkout")?.processingStatus, "skipped")
  })
  test("session operation metadata alone cannot overwrite a newer ended binding", async () => {
    correlatedCreation(); profile.stripeSubscriptionId = "sub_new"
    subscriptionOverrides.sub_new = { status: "canceled" }
    await assert.rejects(hosted()); assert.equal(profile.stripeSubscriptionId, "sub_new"); assert.equal(writes.length, 0)
  })
  test("recorded starting binding permits a unique new subscription only after verifying old binding ended", async () => {
    correlatedCreation(); profile.stripeSubscriptionId = "sub_old"
    operation!.startingBinding = { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_old" }
    operation!.stripeSubscriptionId = "sub_old"
    subscriptionOverrides.sub_old = { status: "canceled" }
    await hosted(); assert.equal(profile.stripeSubscriptionId, "sub_1")
  })
  test("legacy session cannot replace a different binding from metadata alone", async () => {
    profile.stripeSubscriptionId = "sub_new"; subscriptionOverrides.sub_new = { status: "canceled" }
    await assert.rejects(hosted()); assert.equal(writes.length, 0)
  })
  for (const patch of [
    { actorUserId: "foreign" }, { executionVersion: 99 }, { stripeSessionId: "cs_other" },
    { action: "portal_create" }, { status: "failed" },
  ]) test(`hosted journal generation/correlation rejects ${JSON.stringify(patch)}`, async () => {
    correlatedCreation(); Object.assign(operation!, patch)
    await assert.rejects(hosted()); assert.equal(writes.length, 0)
  })
  test("subscription operation correlation must agree with session and frozen creation step", async () => {
    correlatedCreation(); provider.metadata = { userId: "tenant", operationId: "other" }
    await assert.rejects(hosted()); assert.equal(writes.length, 0)
    provider.metadata = session.metadata
    creationStep!.normalizedRequest = { customer: "cus_foreign" }
    await assert.rejects(hosted()); assert.equal(writes.length, 0)
  })
  test("hosted lifecycle cannot terminally acknowledge a lost webhook claim after provider reads", async () => {
    const context = webhook("evt_hosted_lost"); profile.stripeSubscriptionId = null
    onRead = async () => { ledger.rows.get("evt_hosted_lost")!.processingToken = "replacement" }
    await assert.rejects(hostedApi.reconcileHostedCheckout(stripe, "tenant", "cs_1", context), { message: "webhook_claim_lost" })
    assert.equal(writes.length, 0); assert.equal(profile.billingAccessVersion, 7)
  })
  test("hosted projection and ledger terminal status roll back together", async () => {
    const context = webhook("evt_hosted_rollback"); profile.stripeSubscriptionId = null; ledger.finishError = true
    await assert.rejects(hostedApi.reconcileHostedCheckout(stripe, "tenant", "cs_1", context))
    assert.equal(writes.length, 0); assert.equal(profile.stripeSubscriptionId, null); assert.equal(profile.billingAccessVersion, 7)
    assert.equal(ledger.rows.get("evt_hosted_rollback")?.processingStatus, "processing")
  })
  test("genuine lifecycle truth does not finalize even the original uncertain session-create operation", async () => {
    correlatedCreation(); profile.stripeSubscriptionId = null
    operation!.status = "reconciliation_required"; creationStep!.status = "reconciliation_required"
    operation!.stripeSessionId = null; creationStep!.stripeSessionId = null
    profile.pendingBillingMutationId = operation!.id as string
    const before = structuredClone(operation)
    await hostedApi.reconcileHostedCheckout(stripe, "tenant", "cs_1", webhook("evt_original_uncertain"))
    assert.equal(profile.stripeSubscriptionId, "sub_1"); assert.deepEqual(operation, before)
    assert.equal(profile.pendingBillingMutationId, before!.id)
    assert.equal(creationStep!.status, "reconciliation_required")
  })
  test("an ended list hint cannot hide a competing subscription that is currently live", async () => {
    subscriptionPages = [{ data: [{ ...provider, id: "sub_competing", status: "canceled" }], has_more: false }]
    subscriptionOverrides.sub_competing = { status: "active" }
    await assert.rejects(hosted()); assert.equal(writes.length, 0)
  })
  test("duplicate/cyclic subscription pages fail closed and cannot establish uniqueness", async () => {
    subscriptionPages = [
      { data: [{ ...provider, id: "sub_1" }], has_more: true },
      { data: [{ ...provider, id: "sub_1" }], has_more: false },
    ]
    await assert.rejects(hosted()); assert.equal(writes.length, 0)
  })
  test("conflicting current bound customer fails instead of terminally skipping an obsolete session", async () => {
    profile.stripeSubscriptionId = "sub_new"; provider.status = "canceled"
    subscriptionOverrides.sub_new = { status: "active", customer: "cus_foreign" }
    const context = webhook("evt_bound_conflict")
    await assert.rejects(hostedApi.reconcileHostedCheckout(stripe, "tenant", "cs_1", context))
    assert.equal(writes.length, 0); assert.equal(ledger.rows.get("evt_bound_conflict")?.processingStatus, "processing")
  })

  for (const created of [100, 500]) {
    test(`delivered ${created < 500 ? "older" : "equal"} timestamp cannot undo a confirmed direct extension`, async () => {
      // The provider mutation has already returned outside any DB transaction.
      provider.trial_end = 2100000000
      await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", { kind: "direct", expectedVersion: 7 })
      assert.equal(profile.billingAccessVersion, 8)
      assert.deepEqual(profile.latestStripeEventCreatedAt, new Date(500000), "direct results do not invent event time")
      await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook("evt_old", created), [{
        customer: "cus_1", metadata: {}, // Old payload dates/status are never projection input.
      }])
      assert.deepEqual(profile.trialEndsAt, new Date(2100000000000))
      assert.equal(profile.billingAccessVersion, 9)
      assert.deepEqual(profile.latestStripeEventCreatedAt, new Date(500000))
      assert.equal(ledger.rows.get("evt_old")?.processingStatus, "processed")
      assert.deepEqual(history.slice(-5), ["lock", "read:sub_1:trialing", "event-fence", "projection", "terminal"])
    })
  }
  for (const status of ["active", "canceled", "past_due", "unpaid", "incomplete"]) {
    test(`fresh ${status} replaces an extension even when triggered by an older event`, async () => {
      profile.trialEndsAt = new Date(2200000000000)
      provider.status = status; provider.trial_end = null
      provider.latest_invoice = { period_start: 1800000000, period_end: 1900000000 }
      await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook())
      assert.equal(profile.subscriptionStatus, status)
      assert.equal(profile.trialEndsAt, null)
      assert.deepEqual(writes[0].subscriptionCurrentPeriodEnd, new Date(1900000000000))
      assert.equal(profile.subscriptionTier, "business_control", "no local maximum or base-tier fallback")
    })
  }
  test("deletion retains independent grant and every invoice/sequence state, including without a grant", async () => {
    const beforeGrant = structuredClone(grant), beforeInvoices = structuredClone(invoices)
    provider.status = "canceled"; provider.trial_end = null
    await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook())
    assert.equal(resolveEffectiveAccess({ profile, grant, billingRisks: [] }, new Date("2026-10-15")).source, "admin_grant")
    assert.equal(resolveEffectiveAccess({ profile, grant: null, billingRisks: [] }, new Date("2026-10-15")).allowAccess, false)
    await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook("evt_no_grant"))
    assert.deepEqual(grant, beforeGrant); assert.deepEqual(invoices, beforeInvoices)
    assert.ok(writes.every((data) => !("pendingTrialOperationId" in data)))
  })
  test("concurrent different-event snapshots are read after serialization, never before the lock", async () => {
    const entered = deferred(), release = deferred()
    onRead = async () => { entered.resolve(); await release.promise }
    const first = api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook("evt_first"))
    await entered.promise
    provider.status = "active"; provider.trial_end = null
    onRead = undefined
    const second = api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook("evt_second"))
    await Promise.resolve()
    assert.equal(history.filter((entry) => entry.startsWith("read:")).length, 1)
    release.resolve(); await Promise.all([first, second])
    assert.equal(profile.subscriptionStatus, "active"); assert.equal(profile.trialEndsAt, null)
    assert.equal(profile.billingAccessVersion, 9)
    assert.deepEqual(writes.map((write) => write.subscriptionStatus), ["trialing", "active"])
  })
  test("concurrent direct snapshots with one expected version allow only one commit", async () => {
    const results = await Promise.allSettled([1, 2].map(() =>
      api.reconcileTenantSubscription(stripe, "tenant", "sub_1", { kind: "direct", expectedVersion: 7 })))
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
    assert.equal(results.filter((result) => result.status === "rejected").length, 1)
    assert.equal(writes.length, 1); assert.equal(profile.billingAccessVersion, 8)
    assert.equal(history.filter((entry) => entry.startsWith("read:")).length, 1)
  })
  test("direct reconciliation conflicts with durable unresolved reservation, including an expired lease", async () => {
    profile.pendingTrialOperationId = "operation"
    await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_1", { kind: "direct" }), { code: "trial_operation_in_progress" })
    assert.deepEqual(writes, []); assert.equal(history.some((entry) => entry.startsWith("read:")), false)
    // Webhooks must still project newer real state without clearing the reservation.
    provider.status = "past_due"
    await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook())
    assert.equal(profile.subscriptionStatus, "past_due"); assert.equal(profile.pendingTrialOperationId, "operation")
  })
  test("own-operation commits require matching tenant, binding, token, owner, status and live lease", async () => {
    profile.pendingTrialOperationId = "operation"
    const fence = { kind: "owner" as const, operationId: "operation", leaseOwner: "executor", fencingToken: 2 }
    const valid = { id: "operation", userId: "tenant", leaseOwner: "executor", fencingToken: 2,
      status: "pending", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", leaseExpiresAt: new Date("2100-01-01") }
    for (const invalid of [
      { userId: "other" }, { fencingToken: 3 }, { leaseOwner: "replacement" }, { status: "succeeded" },
      { leaseExpiresAt: new Date(0) }, { stripeSubscriptionId: "sub_other" }, { stripeCustomerId: "cus_other" },
    ]) {
      operation = { ...valid, ...invalid }
      await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_1", { kind: "direct", operationFence: fence }), { code: "trial_operation_fence_lost" })
    }
    assert.deepEqual(writes, [])
    operation = valid; provider.trial_end = 2100000000
    await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", { kind: "direct", operationFence: fence })
    assert.equal(profile.billingAccessVersion, 8); assert.equal(profile.pendingTrialOperationId, "operation")
    assert.deepEqual(profile.trialEndsAt, new Date(2100000000000))
  })
  test("executor losing its operation fence DURING the provider read cannot overwrite state", async () => {
    profile.pendingTrialOperationId = "operation"
    operation = { id: "operation", userId: "tenant", leaseOwner: "executor", fencingToken: 2,
      status: "pending", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", leaseExpiresAt: new Date("2100-01-01") }
    onRead = async () => { operation!.fencingToken = 3 }
    await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_1", {
      kind: "direct", operationFence: { kind: "owner", operationId: "operation", leaseOwner: "executor", fencingToken: 2 },
    }), { code: "trial_operation_fence_lost" })
    assert.deepEqual(writes, []); assert.equal(profile.billingAccessVersion, 7)
  })
  test("owner grant/revoke/extension and pure direct getter conflict with unknown customer outcome, even after lease expiry", async () => {
    profile.pendingBillingMutationId = "customer-operation"
    let callbacks = 0
    for (const action of ["grant", "revoke", "extend", "getter"]) {
      await assert.rejects(api.coordinateTenantBilling("tenant", { kind: "direct" }, async () => {
        callbacks++; return { result: action }
      }), { code: "billing_mutation_in_progress" })
    }
    assert.equal(callbacks, 0); assert.deepEqual(writes, [])
    provider.status = "active"
    await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook("evt_during_customer"))
    assert.equal(profile.subscriptionStatus, "active"); assert.equal(profile.billingAccessVersion, 8)
    assert.equal(profile.pendingBillingMutationId, "customer-operation", "current truth does not prove or clear the operation")
  })
  test("recognized customer fence uses post-acceptance executionVersion even after webhook projection advances today's version", async () => {
    profile.pendingBillingMutationId = "customer-operation"; profile.billingAccessVersion = 12
    const fence = { kind: "customer" as const, operationId: "customer-operation", leaseOwner: "executor", fencingToken: 4, executionVersion: 9 }
    operation = { id: fence.operationId, userId: "tenant", actorUserId: "tenant", leaseOwner: "executor", fencingToken: 4,
      executionVersion: 9, status: "reconciliation_required", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", leaseExpiresAt: new Date("2100-01-01") }
    await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", { kind: "direct", expectedVersion: 9, operationFence: fence })
    assert.equal(profile.billingAccessVersion, 13); assert.equal(profile.pendingBillingMutationId, fence.operationId)
    await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_1", {
      kind: "direct", expectedVersion: 7, operationFence: fence,
    }), { code: "billing_version_conflict" })
    operation.fencingToken = 5
    await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_1", {
      kind: "direct", operationFence: fence,
    }), { code: "billing_mutation_fence_lost" })
  })
  test("direct empty callbacks cannot skip missing reservation fields, an unrecognized fence or a dual reservation", async () => {
    const callback = async () => { assert.fail("must fail before even a pure getter"); return { result: undefined } }
    Reflect.deleteProperty(profile, "pendingBillingMutationId")
    await assert.rejects(api.coordinateTenantBilling("tenant", { kind: "direct" }, callback), { code: "billing_mutation_in_progress" })
    profile.pendingBillingMutationId = null
    await assert.rejects(api.coordinateTenantBilling("tenant", {
      kind: "direct", operationFence: { kind: "unrecognized" } as unknown as NonNullable<Extract<Parameters<typeof api.coordinateTenantBilling>[1], { kind: "direct" }>["operationFence"]>,
    }, callback), { code: "billing_fence_invalid" })
    profile.pendingTrialOperationId = "owner-operation"; profile.pendingBillingMutationId = "customer-operation"
    await assert.rejects(api.coordinateTenantBilling("tenant", { kind: "direct", operationFence: {
      kind: "owner", operationId: "owner-operation", leaseOwner: "worker", fencingToken: 1,
    } }, callback), { code: "billing_mutation_in_progress" })
  })
  test("terminal ledger failure rolls back projection and version; retry re-reads provider truth", async () => {
    const context = webhook()
    ledger.finishError = true
    await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_1", context))
    assert.equal(profile.billingAccessVersion, 7); assert.deepEqual(writes, [])
    assert.equal(ledger.rows.get("evt_1")?.processingStatus, "processing")
    ledger.finishError = false; provider.status = "canceled"
    await api.reconcileTenantSubscription(stripe, "tenant", "sub_1", context)
    assert.equal(profile.subscriptionStatus, "canceled"); assert.equal(profile.billingAccessVersion, 8)
    assert.equal(ledger.rows.get("evt_1")?.processingStatus, "processed")
  })
  test("risk, projection and version roll back if terminal ledger transition fails", async () => {
    const context = webhook()
    provider.status = "unpaid"; ledger.finishError = true
    await assert.rejects(riskApi.reconcileBillingRiskEvent(stripe,
      { kind: "subscription_invoice", id: "in_debt" }, "evt_1", new Date("2026-10-15"), context.claim))
    assert.deepEqual(risks, []); assert.deepEqual(writes, []); assert.equal(profile.billingAccessVersion, 7)
    ledger.finishError = false
    await riskApi.reconcileBillingRiskEvent(stripe,
      { kind: "subscription_invoice", id: "in_debt" }, "evt_1", new Date("2026-10-15"), context.claim)
    assert.equal(risks.length, 1); assert.equal(profile.subscriptionStatus, "unpaid")
    assert.equal(profile.billingAccessVersion, 8); assert.equal(ledger.rows.get("evt_1")?.processingStatus, "processed")
  })
  test("projection persistence failure cannot leave a terminal event or a committed risk", async () => {
    const context = webhook()
    failProfile = true
    await assert.rejects(riskApi.reconcileBillingRiskEvent(stripe,
      { kind: "subscription_invoice", id: "in_debt" }, "evt_1", new Date("2026-10-15"), context.claim))
    assert.deepEqual(risks, []); assert.deepEqual(writes, []); assert.equal(profile.billingAccessVersion, 7)
    assert.equal(ledger.rows.get("evt_1")?.processingStatus, "processing")
    assert.equal(history.includes("terminal"), false)
  })
  test("lost/expired event fences reject both projection and risk commits", async () => {
    for (const expire of [false, true]) {
      const context = webhook()
      onRead = async () => {
        const row = ledger.rows.get("evt_1")!
        if (expire) row.processingLeaseUntil = new Date(0)
        else row.processingToken = "replacement"
      }
      await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_1", context), { message: "webhook_claim_lost" })
      assert.deepEqual(writes, []); assert.equal(profile.billingAccessVersion, 7)
      assert.equal(ledger.rows.get("evt_1")?.processingStatus, "processing")
    }
  })
  test("superseded subscription requires verified current binding and never rebinds", async () => {
    profile.stripeSubscriptionId = "sub_new"
    const result = await api.reconcileTenantSubscription(stripe, "tenant", "sub_old", webhook())
    assert.equal(result.kind, "superseded"); assert.deepEqual(writes, [])
    assert.deepEqual(history.filter((entry) => entry.startsWith("read:")), ["read:sub_old:trialing", "read:sub_new:trialing"])
    assert.equal(ledger.rows.get("evt_1")?.processingStatus, "skipped")
    provider.customer = "cus_other"
    await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_old", webhook("evt_conflict")))
    assert.equal(ledger.rows.get("evt_conflict")?.processingStatus, "processing")
  })
  test("current binding is checked under lock, not accepted from caller hints", async () => {
    await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_1", webhook(), [{ customer: "cus_other" }]))
    assert.deepEqual(writes, []); assert.equal(profile.billingAccessVersion, 7)
  })
  test("obsolete object alone cannot establish supersession when current provider binding is inconsistent", async () => {
    profile.stripeSubscriptionId = "sub_new"
    onRead = async () => { provider.customer = "cus_other" }
    await assert.rejects(api.reconcileTenantSubscription(stripe, "tenant", "sub_old", webhook()))
    assert.deepEqual(writes, []); assert.equal(profile.billingAccessVersion, 7)
    assert.equal(ledger.rows.get("evt_1")?.processingStatus, "processing", "inconsistent current truth must not be terminally skipped")
  })
  test("released schedule verifies current provider state and cannot clear a replacement schedule", async () => {
    profile.stripeScheduleId = "sched_new"; profile.pendingDowngradeTier = "essentials"
    await api.reconcileTenantScheduleRelease(stripe, "tenant", "sched_old", webhook("evt_old_schedule"))
    assert.deepEqual(writes, []); assert.equal(profile.stripeScheduleId, "sched_new")
    await api.reconcileTenantScheduleRelease(stripe, "tenant", "sched_new", webhook("evt_release"))
    assert.equal(profile.stripeScheduleId, null); assert.equal(profile.pendingDowngradeTier, null)
    assert.equal(profile.billingAccessVersion, 8); assert.equal(ledger.rows.get("evt_release")?.processingStatus, "processed")
  })
})