import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import Stripe from "stripe"
import { WebhookLedgerMock } from "@/tests/helpers/webhookLedgerMock"
import { resolveEffectiveAccess, type TrialGrantSnapshot } from "@/lib/billing/effectiveAccess"
import type { TrialBillingRiskEvidence } from "@/lib/billing/trialEligibility"

const secret = "whsec_risk_test_only"
const signing = new Stripe("sk_test_dummy", { apiVersion: "2026-05-27.dahlia" })
const now = new Date("2026-10-15T12:00:00Z")
type Risk = TrialBillingRiskEvidence & { userId: string; reconciledAt?: Date; stripeEventId?: string }
type Profile = {
  userId: string; stripeCustomerId: string; stripeSubscriptionId: string;
  subscriptionStatus: string; subscriptionTier: string; trialEndsAt: null;
  billingAccessVersion: number; pendingTrialOperationId: null; pendingDowngradeTier: null;
}
type Page = { id: string; invoice: string; payment: { type: string; payment_intent?: string; charge?: string } }
let profile: Profile
let risks: Risk[]
let invoices: Record<string, Record<string, unknown>>
let dispute: Record<string, unknown>
let charge: Record<string, unknown>
let payments: Page[][]
let calls: { method: string; args: unknown[] }[]
let notes: { processingStatus: string; processingNote?: string }[]
let locked: boolean
let fail: string | null
let unknownProfile: boolean
let failVersion: boolean
let writeCount: number
let subscriptionOverrides: Record<string, unknown>
let customerOverrides: Record<string, unknown>
let onLock: (() => void) | null
let ledger = new WebhookLedgerMock()
let POST: typeof import("@/app/api/webhooks/stripe-billing/route").POST

function invoice(id = "in_1", overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, customer: "cus_1", metadata: {}, status: "paid", amount_remaining: 0, attempt_count: 1,
    due_date: null, billing_reason: "subscription_cycle",
    parent: { type: "subscription_details", subscription_details: { subscription: "sub_old", metadata: {} } },
    ...overrides }
}
function record(method: string, args: unknown[]): void {
  calls.push({ method, args })
  if (fail === method) throw new Error("private provider failure")
  for (const value of args) if (value && typeof value === "object") assert.equal("stripeAccount" in value, false)
}
function providerRead(method: string, value: () => unknown) {
  return async (...args: unknown[]) => { record(method, args); return value() }
}
function request(type: string, id = type.startsWith("invoice.") ? "in_1" : "du_1", delivered: Record<string, unknown> = {}): Request {
  const payload = JSON.stringify({ id: `evt_${type}_${writeCount}_${notes.length}`, created: 1, type,
    data: { object: { id, customer: "cus_obsolete", metadata: { userId: "obsolete" }, status: "obsolete", ...delivered } } })
  return new Request("http://localhost/api/webhooks/stripe-billing", { method: "POST", body: payload,
    headers: { "stripe-signature": signing.webhooks.generateTestHeaderString({ payload, secret }) } })
}
function access(grantOverrides: Partial<TrialGrantSnapshot> = {}) {
  return resolveEffectiveAccess({ profile, billingRisks: risks, grant: {
    plan: "small_business", startsAt: new Date("2026-10-01T12:00:00Z"),
    expiresAt: new Date("2026-11-01T12:00:00Z"), revokedAt: null, ...grantOverrides,
  } }, now)
}

describe("signed independently scoped subscription billing risks", () => {
  before(async () => {
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = secret
    process.env.STRIPE_SOLO_PRICE_ID = "price_control"
    process.env.STRIPE_STARTER_PRICE_ID = "price_base"
    await mock.module("server-only", { namedExports: {} })
    const tx = {
      stripeBillingWebhookEvent: {
        updateMany: async (args: Parameters<typeof ledger.delegate.updateMany>[0]) => {
          const result = await ledger.delegate.updateMany(args)
          if (result.count && ["processed", "skipped"].includes(String(args.data.processingStatus))) {
            notes.push(args.data as { processingStatus: string; processingNote?: string })
          }
          return result
        },
      },
      $executeRawUnsafe: async (...args: unknown[]) => {
        assert.deepEqual(args, ["SELECT pg_advisory_xact_lock(hashtext($1))", "billing-access:tenant_1"])
        locked = true
        onLock?.()
      },
      userProfile: {
        findUnique: async ({ where }: { where: { userId: string } }) => {
          assert.ok(locked); assert.equal(where.userId, profile.userId); return { ...profile }
        },
        update: async ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
          if (!("billingAccessVersion" in data)) {
            // Lifecycle writes now enter a ledger-fenced transaction, not the
            // risk coordinator. Keep risk lock/version assertions below intact.
            assert.equal(where.userId, profile.userId)
            assert.ok(ledger.fences.length > 0)
            const fence = ledger.fences.at(-1)!
            assert.equal(ledger.rows.get(String(fence.where.stripeEventId))?.processingToken, fence.where.processingToken)
            Object.assign(profile, data)
            return
          }
          assert.ok(locked); assert.equal(where.userId, profile.userId)
          assert.deepEqual(data.billingAccessVersion, { increment: 1 })
          if (failVersion) throw new Error("version persistence failed")
          const { billingAccessVersion: _version, ...projection } = data
          Object.assign(profile, projection)
          profile.billingAccessVersion++
        },
      },
      trackedInvoice: { updateMany: async () => ({ count: 0 }) },
      tenantBillingRisk: {
        findUnique: async ({ where }: { where: { kind_stripeObjectId: { kind: string; stripeObjectId: string } } }) => {
          assert.ok(locked)
          return risks.find((risk) => risk.kind === where.kind_stripeObjectId.kind && risk.stripeObjectId === where.kind_stripeObjectId.stripeObjectId) ?? null
        },
        upsert: async ({ where, create, update }: { where: { kind_stripeObjectId: { kind: string; stripeObjectId: string } }; create: Risk; update: Partial<Risk> }) => {
          assert.ok(locked); assert.equal(create.userId, profile.userId)
          const previous = risks.find((risk) => risk.kind === where.kind_stripeObjectId.kind && risk.stripeObjectId === where.kind_stripeObjectId.stripeObjectId)
          if (previous) Object.assign(previous, update)
          else risks.push({ ...create })
          writeCount++
        },
      },
    }
    await mock.module("@/lib/db/admin", { namedExports: { prismaAdmin: {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const beforeRisks = structuredClone(risks), beforeProfile = { ...profile }
        try { return await fn(tx) } catch (error) { risks = beforeRisks; profile = beforeProfile; throw error }
        finally { locked = false }
      },
      userProfile: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          if (unknownProfile) return null
          if (where.stripeCustomerId) return where.stripeCustomerId === profile.stripeCustomerId ? { ...profile } : null
          return { ...profile }
        },
        findUnique: async () => ({ ...profile }),
        update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(profile, data) },
      },
      stripeBillingWebhookEvent: {
        create: (args: Parameters<typeof ledger.delegate.create>[0]) => ledger.delegate.create(args),
        findUnique: (args: Parameters<typeof ledger.delegate.findUnique>[0]) => ledger.delegate.findUnique(args),
        updateMany: async (args: Parameters<typeof ledger.delegate.updateMany>[0]) => {
          const result = await ledger.delegate.updateMany(args)
          if (result.count && ["processed", "skipped", "failed"].includes(String(args.data.processingStatus))) {
            notes.push(args.data as { processingStatus: string; processingNote?: string })
          }
          return result
        },
      },
      trackedInvoice: { findMany: async () => [] },
    } } })
    await mock.module("@/lib/billing/stripeClient", { namedExports: { createStripeClient: () => ({
      webhooks: signing.webhooks,
      customers: { retrieve: providerRead("customers.retrieve", () => ({ id: "cus_1", metadata: {}, ...customerOverrides })) },
      disputes: { retrieve: providerRead("disputes.retrieve", () => ({ ...dispute })) },
      charges: { retrieve: providerRead("charges.retrieve", () => ({ ...charge })) },
      subscriptions: { retrieve: async (...args: unknown[]) => {
        record("subscriptions.retrieve", args)
        return { id: args[0], customer: "cus_1", metadata: {}, status: "canceled",
          items: { data: [{ price: { id: "price_control" } }], has_more: false },
          cancel_at: null, cancel_at_period_end: false, trial_end: null, latest_invoice: null, ...subscriptionOverrides }
      } },
      invoices: {
        retrieve: async (...args: unknown[]) => { record("invoices.retrieve", args); assert.ok(invoices[String(args[0])]); return { ...invoices[String(args[0])] } },
        list: async (...args: unknown[]) => { record("invoices.list", args); return { data: Object.values(invoices), has_more: false } },
      },
      invoicePayments: { list: async (...args: unknown[]) => {
        record("invoicePayments.list", args)
        const params = args[0] as { starting_after?: string }
        const page = params.starting_after ? payments.findIndex((page) => page.at(-1)?.id === params.starting_after) + 1 : 0
        return { data: payments[page], has_more: page < payments.length - 1 }
      } },
    }) } })
    ;({ POST } = await import("@/app/api/webhooks/stripe-billing/route"))
  })
  beforeEach(() => {
    profile = { userId: "tenant_1", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_current",
      subscriptionStatus: "canceled", subscriptionTier: "essentials", trialEndsAt: null,
      billingAccessVersion: 7, pendingTrialOperationId: null, pendingDowngradeTier: null }
    risks = []; notes = []; calls = []; locked = false; fail = null; unknownProfile = false; failVersion = false; writeCount = 0
    ledger = new WebhookLedgerMock()
    subscriptionOverrides = {}; customerOverrides = {}
    onLock = null
    invoices = { in_1: invoice() }
    dispute = { id: "du_1", charge: "ch_1", payment_intent: "pi_1", metadata: {}, status: "needs_response" }
    charge = { id: "ch_1", customer: "cus_1", payment_intent: "pi_1", metadata: {}, on_behalf_of: null, transfer_data: null, source_transfer: null }
    payments = [[{ id: "inpay_1", invoice: "in_1", payment: { type: "payment_intent", payment_intent: "pi_1" } }]]
  })

  for (const type of ["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"]) {
    for (const status of ["warning_needs_response", "warning_under_review", "needs_response", "under_review", "lost", "won", "warning_closed", "prevented"]) {
      test(`${type} persists verified ${status}, ignoring delivered obsolete identities/status`, async () => {
        dispute.status = status
        const res = await POST(request(type))
        assert.equal(res.status, 200)
        assert.equal(risks.length, 1)
        assert.equal(risks[0].stripeStatus, status)
        assert.equal(risks[0].blocking, !["won", "warning_closed", "prevented"].includes(status))
        assert.equal(risks[0].stripeSubscriptionId, "sub_old")
        assert.equal(risks[0].stripeInvoiceId, "in_1")
        assert.equal(risks[0].stripeChargeId, "ch_1")
        assert.equal(profile.stripeSubscriptionId, "sub_current")
        assert.equal(profile.billingAccessVersion, 8)
        assert.ok(risks[0].reconciledAt instanceof Date)
        assert.ok(risks[0].stripeEventId)
        assert.equal(calls.some(({ method }) => method === "invoices.list"), false, "normal PaymentIntent mapping is focused, not full-history preflight")
      })
    }
  }
  test("unrelated paid invoice and subscription deletion never clear disputed paid charge", async () => {
    assert.equal((await POST(request("charge.dispute.created"))).status, 200)
    assert.equal(access().allowAccess, false)
    invoices.in_other = invoice("in_other")
    assert.equal((await POST(request("invoice.paid", "in_other"))).status, 200)
    assert.equal((await POST(request("customer.subscription.deleted", "sub_current", { customer: "cus_1", metadata: {} }))).status, 200)
    assert.equal(risks.find((risk) => risk.stripeObjectId === "du_1")?.blocking, true)
    assert.equal(access().allowAccess, false)
  })
  test("all specific resolutions restore only still-valid grants without any grant writes", async () => {
    invoices.in_debt = invoice("in_debt", { status: "uncollectible" })
    await POST(request("invoice.marked_uncollectible", "in_debt"))
    await POST(request("charge.dispute.created"))
    dispute.status = "won"
    await POST(request("charge.dispute.closed"))
    assert.equal(access().allowAccess, false, "unrelated debt survives dispute win")
    invoices.in_debt.status = "void"
    await POST(request("invoice.voided", "in_debt"))
    assert.equal(access().source, "admin_grant")
    assert.equal(access({ expiresAt: now }).allowAccess, false)
    assert.equal(access({ revokedAt: new Date("2026-10-14") }).allowAccess, false)
    assert.equal(access({ startsAt: new Date("2026-10-16") }).allowAccess, false)
    profile.subscriptionStatus = "unpaid"
    assert.equal(access().allowAccess, false)
  })
  for (const type of ["invoice.payment_failed", "invoice.updated", "invoice.finalized", "invoice.marked_uncollectible", "invoice.paid", "invoice.payment_succeeded", "invoice.voided"]) {
    test(`${type} reconciles current invoice risk, not the event name or global stale watermark`, async () => {
      invoices.in_1 = invoice("in_1", { status: "open", amount_remaining: 100, attempt_count: 1 })
      assert.equal((await POST(request(type))).status, 200)
      assert.equal(risks[0].blocking, true)
      assert.equal(risks[0].stripeStatus, "open")
      assert.equal(profile.subscriptionStatus, "canceled", "historical invoice does not replace current subscription status")
    })
  }
  test("overdue/uncollectible invoices block; an open fact stays blocking until that invoice is paid/void", async () => {
    invoices.in_1 = invoice("in_1", { status: "open", amount_remaining: 100, attempt_count: 0, due_date: 1 })
    await POST(request("invoice.updated"))
    assert.equal(risks[0].blocking, true)
    Object.assign(invoices.in_1, { amount_remaining: 0, attempt_count: 0, due_date: null })
    await POST(request("invoice.updated"))
    assert.equal(risks[0].blocking, true)
    invoices.in_other = invoice("in_other")
    await POST(request("invoice.paid", "in_other"))
    assert.equal(risks[0].blocking, true)
    invoices.in_1.status = "draft"
    assert.equal((await POST(request("invoice.updated"))).status, 503)
    assert.equal(risks[0].blocking, true)
    invoices.in_1.status = "paid"
    await POST(request("invoice.paid"))
    assert.equal(risks[0].blocking, false)
    invoices.in_1.status = "uncollectible"
    await POST(request("invoice.marked_uncollectible"))
    assert.equal(risks[0].blocking, true)
    invoices.in_1.status = "void"
    await POST(request("invoice.voided"))
    assert.equal(risks[0].blocking, false)
  })
  test("current canceled subscription is not resurrected by a delivered paid invoice", async () => {
    profile.stripeSubscriptionId = "sub_old"
    assert.equal((await POST(request("invoice.paid"))).status, 200)
    assert.equal(profile.subscriptionStatus, "canceled")
    assert.equal(profile.billingAccessVersion, 8)
  })
  test("legacy direct charge mapping paginates payments and validates the retrieved invoice", async () => {
    charge.payment_intent = null; dispute.payment_intent = null
    payments = [[{ id: "pay_other", invoice: "in_1", payment: { type: "charge", charge: "ch_other" } }],
      [{ id: "pay_old", invoice: "in_1", payment: { type: "charge", charge: "ch_1" } }]]
    assert.equal((await POST(request("charge.dispute.created"))).status, 200)
    assert.equal(risks[0].blocking, true)
    assert.ok(calls.some(({ method, args }) => method === "invoicePayments.list" && (args[0] as { starting_after?: string }).starting_after === "pay_other"))
  })
  test("verified Connect charge is excluded before billing mapping", async () => {
    charge.on_behalf_of = "acct_debtor"; fail = "invoicePayments.list"
    assert.equal((await POST(request("charge.dispute.created"))).status, 200)
    assert.equal(writeCount, 0)
    assert.equal(notes.at(-1)?.processingStatus, "skipped")
  })
  test("verified one-time PaymentIntent and explicit manual invoice are skipped, not risks", async () => {
    payments = [[]]
    assert.equal((await POST(request("charge.dispute.created"))).status, 200)
    invoices.in_1 = invoice("in_1", { parent: null, billing_reason: "manual" })
    assert.equal((await POST(request("invoice.payment_failed"))).status, 200)
    assert.equal(writeCount, 0)
    assert.equal(notes.at(-1)?.processingStatus, "skipped")
  })
  test("metadata-only subscription mapping cannot establish platform billing relevance", async () => {
    payments = [[]]; charge.metadata = { subscriptionId: "sub_old" }
    assert.equal((await POST(request("charge.dispute.created"))).status, 503)
    assert.equal(writeCount, 0)
  })
  for (const method of ["disputes.retrieve", "charges.retrieve", "customers.retrieve", "invoices.retrieve", "invoicePayments.list", "subscriptions.retrieve"]) {
    test(`${method} failure returns sanitized retryable failure without risk/version changes`, async () => {
      fail = method
      const response = await POST(request("charge.dispute.updated"))
      assert.equal(response.status, 503)
      assert.equal(JSON.stringify(await response.json()).includes("private"), false)
      assert.equal(writeCount, 0); assert.equal(profile.billingAccessVersion, 7)
      assert.equal(notes.at(-1)?.processingStatus, "failed")
    })
  }
  test("unknown mappings/status/customer conflicts fail rather than acknowledging irrelevance", async () => {
    for (const mutate of [
      () => { unknownProfile = true },
      () => { dispute.status = "unknown" },
      () => { charge.metadata = { userId: "another_tenant" } },
      () => { dispute.metadata = { userId: "another_tenant" } },
      () => { customerOverrides = { metadata: { userId: "another_tenant" } } },
      () => { invoices.in_1.parent = null },
      () => { subscriptionOverrides = { customer: "cus_other" } },
      () => { subscriptionOverrides = { items: { data: [{ price: { id: "unknown" } }] } } },
    ]) {
      mutate()
      assert.equal((await POST(request("charge.dispute.created"))).status, 503)
      unknownProfile = false; dispute.status = "needs_response"; dispute.metadata = {}; charge.metadata = {}; customerOverrides = {}
      invoices.in_1 = invoice(); subscriptionOverrides = {}
    }
    assert.equal(writeCount, 0)
  })
  test("metadata-only dispute mapping, mismatched charge/intent and ambiguous payments fail closed", async () => {
    payments = [[]]; dispute.metadata = { subscriptionId: "sub_old" }
    assert.equal((await POST(request("charge.dispute.updated"))).status, 503)
    dispute.metadata = {}; dispute.payment_intent = "pi_other"
    assert.equal((await POST(request("charge.dispute.updated"))).status, 503)
    dispute.payment_intent = "pi_1"
    payments = [[{ id: "pay_1", invoice: "in_1", payment: { type: "payment_intent", payment_intent: "pi_1" } }],
      [{ id: "pay_2", invoice: "in_other", payment: { type: "payment_intent", payment_intent: "pi_1" } }]]
    assert.equal((await POST(request("charge.dispute.updated"))).status, 503)
    assert.equal(writeCount, 0)
  })
  test("another tenant's existing risk cannot be rebound or cleared", async () => {
    await POST(request("charge.dispute.created"))
    risks[0].userId = "another_tenant"
    dispute.status = "won"
    assert.equal((await POST(request("charge.dispute.closed"))).status, 503)
    assert.equal(risks[0].blocking, true)
    assert.equal(profile.billingAccessVersion, 8)
  })
  test("multiple disputes remain independent even on the same paid subscription invoice", async () => {
    await POST(request("charge.dispute.created"))
    dispute.id = "du_2"; dispute.status = "lost"
    await POST(request("charge.dispute.created", "du_2"))
    dispute.id = "du_1"; dispute.status = "won"
    await POST(request("charge.dispute.closed"))
    assert.equal(risks.length, 2)
    assert.equal(risks.find((risk) => risk.stripeObjectId === "du_1")?.blocking, false)
    assert.equal(risks.find((risk) => risk.stripeObjectId === "du_2")?.blocking, true)
    assert.equal(access().allowAccess, false)
  })
  test("contradictory same-invoice evidence cannot clear a known risk", async () => {
    invoices.in_1 = invoice("in_1", { status: "uncollectible" })
    await POST(request("invoice.marked_uncollectible"))
    invoices.in_1.status = "paid"
    subscriptionOverrides.latest_invoice = invoice("in_1", { status: "open", amount_remaining: 100 })
    assert.equal((await POST(request("invoice.paid"))).status, 503)
    assert.equal(risks[0].blocking, true)
    assert.equal(profile.billingAccessVersion, 8)
  })
  test("pre-lock discovery status cannot overwrite the provider resolution observed after lock", async () => {
    onLock = () => { dispute.status = "won" }
    assert.equal((await POST(request("charge.dispute.created"))).status, 200)
    assert.equal(risks[0].stripeStatus, "won")
    assert.equal(risks[0].blocking, false)
    assert.equal(calls.filter(({ method }) => method === "disputes.retrieve").length, 2)
    assert.equal(profile.billingAccessVersion, 8)
  })
  test("signed Connect account envelope is skipped without platform provider reads", async () => {
    const payload = JSON.stringify({ id: "evt_connect", type: "charge.dispute.created", created: 1,
      account: "acct_debtor", data: { object: { id: "du_connect" } } })
    const response = await POST(new Request("http://localhost/api/webhooks/stripe-billing", {
      method: "POST", body: payload, headers: {
        "stripe-signature": signing.webhooks.generateTestHeaderString({ payload, secret }),
      },
    }))
    assert.equal(response.status, 200); assert.deepEqual(calls, [])
    assert.equal(notes.at(-1)?.processingNote, "connect_account_event")
    assert.equal(profile.billingAccessVersion, 7)
  })
  test("risk mutation and version increment roll back together on persistence failure", async () => {
    failVersion = true
    assert.equal((await POST(request("charge.dispute.created"))).status, 503)
    assert.deepEqual(risks, []); assert.equal(profile.billingAccessVersion, 7)
  })
  test("a reclaimed webhook fence blocks risk/version writes and cannot fail its replacement", async () => {
    onLock = () => {
      const row = [...ledger.rows.values()][0]
      row.processingToken = "replacement_executor"
      row.processingLeaseUntil = new Date("2100-01-01")
    }
    assert.equal((await POST(request("charge.dispute.created"))).status, 503)
    assert.deepEqual(risks, []); assert.equal(profile.billingAccessVersion, 7)
    assert.equal(writeCount, 0)
    const row = [...ledger.rows.values()][0]
    assert.equal(row.processingStatus, "processing")
    assert.equal(row.processingToken, "replacement_executor")
    assert.deepEqual(notes, [])
  })
  test("lease expiration during provider reads blocks risk commit until redelivery", async () => {
    onLock = () => { [...ledger.rows.values()][0].processingLeaseUntil = new Date(0) }
    const signed = request("charge.dispute.created")
    const retry = signed.clone()
    assert.equal((await POST(signed)).status, 503)
    assert.deepEqual(risks, []); assert.equal(profile.billingAccessVersion, 7)
    assert.equal(writeCount, 0)
    onLock = null
    assert.equal((await POST(retry)).status, 200)
    assert.equal(risks.length, 1); assert.equal(profile.billingAccessVersion, 8)
    assert.equal(ledger.creates.length, 1)
  })
  test("invalid signature performs no provider or persistence work", async () => {
    const response = await POST(new Request("http://localhost/api/webhooks/stripe-billing", { method: "POST", body: "{}" }))
    assert.equal(response.status, 400)
    assert.deepEqual(calls, []); assert.deepEqual(notes, []); assert.equal(writeCount, 0)
    assert.deepEqual(ledger.creates, []); assert.deepEqual(ledger.claims, [])
  })
})