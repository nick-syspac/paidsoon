/**
 * Route handler tests for the Stripe billing webhook
 * (app/api/webhooks/stripe-billing/route.ts). Covers the invoice.payment_failed
 * handler. Uses the real `stripe` package's own test-signature helper to
 * produce a validly signed request (no network calls), and Node's built-in
 * mock.module() to stub prismaAdmin — no real DB calls are made.
 */
import { describe, test, mock, before, beforeEach, after } from "node:test"
import assert from "node:assert/strict"
import Stripe from "stripe"
import { WebhookLedgerMock } from "@/tests/helpers/webhookLedgerMock"

const WEBHOOK_SECRET = "whsec_test_dummy_secret"

let updateCalls: Array<{ where: unknown; data: unknown }> = []
let findFirstProfile:
  | {
      userId: string
      stripeCustomerId: string
      stripeSubscriptionId?: string | null
      subscriptionTier?: string | null
      pendingDowngradeTier?: string | null
    }
  | null = null
let trackedInvoices: Array<{ id: string }> = []
let subscriptionRetrieveResponse: unknown = null
let checkoutSession: Record<string, unknown>
let subscriptionReadResponses: unknown[] = []
let invoiceAccesses = 0
let invoiceRetrieveResponse: unknown = null
let findUniqueProfile: { latestStripeEventCreatedAt: Date | null } | null = null
let ledger = new WebhookLedgerMock()
let webhookCreateCalls = ledger.creates
let webhookUpdateCalls = ledger.finishes

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stripeBillingRoute: any

const stripe = new Stripe("sk_test_dummy", { apiVersion: "2026-05-27.dahlia" })

describe("Stripe billing webhook", () => {
  before(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = WEBHOOK_SECRET
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter"
    process.env.STRIPE_SOLO_PRICE_ID = "price_solo"
    process.env.STRIPE_SMALL_BUSINESS_PRICE_ID = "price_small_business"
    process.env.STRIPE_BUSINESS_PRO_PRICE_ID = "price_business_pro"

    await mock.module("server-only", { namedExports: {} })
    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
            stripeBillingWebhookEvent: ledger.delegate,
            $executeRawUnsafe: async () => 1,
            trackedInvoice: { updateMany: async () => { invoiceAccesses++; return { count: trackedInvoices.length } } },
            userProfile: {
              findFirst: async () => null,
              findUnique: async () => findFirstProfile ? {
                billingAccessVersion: 0, pendingTrialOperationId: null, pendingDowngradeTier: null,
                ...findFirstProfile, ...findUniqueProfile,
              } : null,
              update: async (args: { where: unknown; data: unknown }) => { updateCalls.push(args); return {} },
            },
            tenantBillingRisk: { findUnique: async () => null, upsert: async () => ({}) },
          }),
          userProfile: {
            findFirst: async () => findFirstProfile,
            findUnique: async (args: { where: { userId: string }; select?: { latestStripeEventCreatedAt?: boolean } }) =>
              args.select?.latestStripeEventCreatedAt ? findUniqueProfile :
                findFirstProfile?.userId === args.where.userId ? findFirstProfile : null,
            update: async (args: { where: unknown; data: unknown }) => {
              updateCalls.push(args)
              return {}
            },
          },
          stripeBillingWebhookEvent: {
            create: (args: Parameters<typeof ledger.delegate.create>[0]) => ledger.delegate.create(args),
            updateMany: (args: Parameters<typeof ledger.delegate.updateMany>[0]) => ledger.delegate.updateMany(args),
            findUnique: (args: Parameters<typeof ledger.delegate.findUnique>[0]) => ledger.delegate.findUnique(args),
          },
          trackedInvoice: {
            findMany: async () => { invoiceAccesses++; return trackedInvoices },
            updateMany: async () => { invoiceAccesses++; return { count: trackedInvoices.length } },
          },
        },
      },
    })

    await mock.module("@/lib/billing/stripeClient", {
      namedExports: {
        createStripeClient: () => ({
          webhooks: stripe.webhooks,
          checkout: { sessions: { retrieve: async () => checkoutSession } },
          customers: { retrieve: async () => ({ id: "cus_123", metadata: {} }) },
          invoices: { retrieve: async () => invoiceRetrieveResponse },
          subscriptions: {
            list: async () => ({ data: [], has_more: false }),
            retrieve: async (id: string) => {
              if (subscriptionReadResponses.length) return subscriptionReadResponses.shift()
              if (subscriptionRetrieveResponse === null) throw new Error("No mocked Stripe subscription response")
              if (id === "sub_new") return currentSubscription({ id })
              return subscriptionRetrieveResponse
            },
          },
        }),
      },
    })

    ;({ POST: stripeBillingRoute } = await import("@/app/api/webhooks/stripe-billing/route"))
  })

  after(() => {
  })

  beforeEach(() => {
    updateCalls = []
    findFirstProfile = null
    trackedInvoices = []
    invoiceAccesses = 0
    subscriptionReadResponses = []
    subscriptionRetrieveResponse = currentSubscription()
    checkoutSession = { id: "cs_123", customer: "cus_123", subscription: "sub_123", metadata: {},
      mode: "subscription", status: "complete", payment_status: "paid", created: 1800000000 }
    invoiceRetrieveResponse = {
      id: "in_123", customer: "cus_123", metadata: {}, status: "open", amount_remaining: 100,
      attempt_count: 1, due_date: null,
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_123", metadata: {} } },
    }
    findUniqueProfile = { latestStripeEventCreatedAt: null }
    ledger = new WebhookLedgerMock()
    webhookCreateCalls = ledger.creates
    webhookUpdateCalls = ledger.finishes
  })

  function currentSubscription(overrides: Record<string, unknown> = {}) {
    return {
      id: "sub_123", customer: "cus_123", status: "active",
      cancel_at: null, cancel_at_period_end: false, trial_end: null,
      items: { data: [{ price: { id: "price_solo" } }] },
      latest_invoice: { period_start: 1733356800, period_end: 1736035200 },
      ...overrides,
    }
  }

  test("persists trialing lifecycle fields on customer.subscription.created", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "essentials",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = {
      ...currentSubscription({ status: "trialing", trial_end: 1735948800 }),
      latest_invoice: {
        period_start: 1733356800,
        period_end: 1736035200,
      },
    }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_created_1",
        created: 100,
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "trialing",
            cancel_at: null,
            cancel_at_period_end: false,
            trial_end: 1735948800,
            items: { data: [{ price: { id: "price_solo" } }] },
          },
        },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionTier: "business_control",
        subscriptionStatus: "trialing",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(100 * 1000),
        billingAccessVersion: { increment: 1 },
        trialEndsAt: new Date(1735948800 * 1000),
      },
    })
  })

  function makeRequest(event: unknown): Request {
    const payload = JSON.stringify(event)
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    })

    return new Request("http://localhost:3000/api/webhooks/stripe-billing", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": signature },
    })
  }

  test("projects fresh past_due state without trusting invoice.payment_failed payload", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123" }
    subscriptionRetrieveResponse = currentSubscription({ status: "past_due" })

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_1",
        created: 0,
        type: "invoice.payment_failed",
        data: { object: { id: "in_123", customer: "cus_123" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.equal((updateCalls[0].data as { subscriptionStatus: string }).subscriptionStatus, "past_due")
    assert.deepEqual((updateCalls[0].data as { billingAccessVersion: unknown }).billingAccessVersion, { increment: 1 })
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("unknown current billing customer fails retryably rather than assuming irrelevant", async () => {
    findFirstProfile = null

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_2",
        created: 0,
        type: "invoice.payment_failed",
        data: { object: { id: "in_123", customer: "cus_unknown" } },
      }),
    )

    assert.equal(res.status, 503)
    assert.equal(updateCalls.length, 0)
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("invoice.paid projects only verified current subscription state", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123" }
    invoiceRetrieveResponse = { ...(invoiceRetrieveResponse as object), status: "paid", amount_remaining: 0 }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_paid_1",
        created: 200,
        type: "invoice.paid",
        data: { object: { id: "in_123", customer: "cus_123" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.equal((updateCalls[0].data as { subscriptionStatus: string }).subscriptionStatus, "active")
    assert.deepEqual(updateCalls[0].where, { userId: "user_1" })
  })

  test("regression: invoice.payment_failed does not downgrade an existing paid tier", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "business_pro",
      stripeSubscriptionId: "sub_123",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = currentSubscription({ status: "past_due", items: { data: [{ price: { id: "price_business_pro" } }] } })

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_regression_failed_1",
        created: 210,
        type: "invoice.payment_failed",
        data: { object: { id: "in_123", customer: "cus_123" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.equal((updateCalls[0].data as { subscriptionStatus: string }).subscriptionStatus, "past_due")
    assert.equal((updateCalls[0].data as { subscriptionTier: string }).subscriptionTier, "business_pro")
  })

  test("persists subscriptionCancelAt when customer.subscription.updated schedules period-end cancellation", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "business_control",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = {
      ...currentSubscription({ cancel_at: 1736035200, cancel_at_period_end: true }),
      latest_invoice: {
        period_start: 1733356800,
        period_end: 1736035200,
      },
    }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_3",
        created: 0,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            cancel_at: 1736035200,
            cancel_at_period_end: true,
            trial_end: null,
            items: { data: [{ price: { id: "price_solo" } }] },
          },
        },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionTier: "business_control",
        subscriptionStatus: "active",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: new Date(1736035200 * 1000),
        subscriptionCancelAtPeriodEnd: true,
        latestStripeEventCreatedAt: new Date(0),
        billingAccessVersion: { increment: 1 },
        trialEndsAt: null,
      },
    })
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("clears subscriptionCancelAt when customer.subscription.updated removes pending cancellation", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "business_control",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = {
      ...currentSubscription(),
      latest_invoice: {
        period_start: 1733356800,
        period_end: 1736035200,
      },
    }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_4",
        created: 0,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            cancel_at: null,
            cancel_at_period_end: false,
            trial_end: null,
            items: { data: [{ price: { id: "price_solo" } }] },
          },
        },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionTier: "business_control",
        subscriptionStatus: "active",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(0),
        billingAccessVersion: { increment: 1 },
        trialEndsAt: null,
      },
    })
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("clears subscriptionCancelAt when customer.subscription.deleted finalizes cancellation", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123" }
    trackedInvoices = Array.from({ length: 30 }, (_, index) => ({ id: `sequence_${index}` }))
    subscriptionRetrieveResponse = currentSubscription({ status: "canceled", latest_invoice: null })

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_5",
        created: 0,
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
          },
        },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionTier: "business_control",
        subscriptionStatus: "canceled",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: null,
        subscriptionCurrentPeriodEnd: null,
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(0),
        billingAccessVersion: { increment: 1 },
        trialEndsAt: null,
      },
    })
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
    assert.equal(invoiceAccesses, 0, "deletion must not even query or pause invoice sequences")
  })

  test("signed pre-lock discovery is discarded and the locked provider snapshot supplies every field", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123", pendingDowngradeTier: null }
    subscriptionReadResponses = [currentSubscription({ status: "trialing", trial_end: 1800000000 }),
      currentSubscription({ status: "past_due", trial_end: null,
        items: { data: [{ price: { id: "price_business_pro" } }] },
        latest_invoice: { period_start: 1900000000, period_end: 2000000000 } })]
    const res = await stripeBillingRoute(makeRequest({ id: "evt_discovery", created: 1,
      type: "customer.subscription.updated", data: { object: currentSubscription({ status: "trialing", trial_end: 1700000000 }) },
    }))
    assert.equal(res.status, 200)
    assert.equal(subscriptionReadResponses.length, 0)
    const data = updateCalls[0].data as Record<string, unknown>
    assert.equal(data.subscriptionStatus, "past_due"); assert.equal(data.subscriptionTier, "business_pro")
    assert.equal(data.trialEndsAt, null)
    assert.deepEqual(data.subscriptionCurrentPeriodEnd, new Date(2000000000000))
  })

  test("rejects an unknown current price without a fallback tier or profile write", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "small_business",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = {
      ...currentSubscription({ items: { data: [{ price: { id: "price_unknown" } }] } }),
      latest_invoice: {
        period_start: 1733356800,
        period_end: 1736035200,
      },
    }

    const response = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_regression_unknown_price_1",
        created: 250,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            cancel_at: null,
            cancel_at_period_end: false,
            trial_end: null,
            items: { data: [{ price: { id: "price_unknown" } }] },
          },
        },
      }),
    )
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: "Billing reconciliation unavailable" })
    assert.equal(ledger.rows.get("evt_test_regression_unknown_price_1")?.processingStatus, "failed")
    assert.equal(updateCalls.length, 0)
  })

  test("returns deduped success for duplicate webhook events", async () => {
    ledger.seed("evt_test_dup_1", "processed")

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_dup_1",
        created: 300,
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_123" } },
      }),
    )
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.deepEqual(body, { received: true, deduped: true })
    assert.equal(updateCalls.length, 0)
    assert.equal(webhookUpdateCalls.length, 0)
  })

  test("older timestamps still reconcile fresh truth without moving the provider-event hint backwards", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "business_control",
      pendingDowngradeTier: null,
    }
    findUniqueProfile = {
      latestStripeEventCreatedAt: new Date(500 * 1000),
    }
    subscriptionRetrieveResponse = {
      ...currentSubscription(),
      latest_invoice: {
        period_start: 1733356800,
        period_end: 1736035200,
      },
    }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_stale_1",
        created: 400,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            cancel_at: null,
            cancel_at_period_end: false,
            trial_end: null,
            items: { data: [{ price: { id: "price_solo" } }] },
          },
        },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.equal((updateCalls[0].data as { subscriptionStatus: string }).subscriptionStatus, "active")
    assert.equal("latestStripeEventCreatedAt" in (updateCalls[0].data as object), false)
    assert.equal(webhookUpdateCalls.length, 1)
    assert.deepEqual(webhookUpdateCalls[0], {
      where: {
        stripeEventId: "evt_test_stale_1", processingStatus: "processing",
        processingToken: ledger.claims[0].data.processingToken,
        processingLeaseUntil: { gt: (webhookUpdateCalls[0].where.processingLeaseUntil as { gt: Date }).gt },
      },
      data: {
        processingStatus: "processed",
        processingNote: null,
        processedAt: webhookUpdateCalls[0]?.data && (webhookUpdateCalls[0].data as { processedAt?: unknown }).processedAt,
        processingToken: null, processingLeaseUntil: null,
      },
    })
  })

  test("resolves profile through stripeSubscriptionId fallback when metadata and customer are absent", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "business_control",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = {
      ...currentSubscription(),
      latest_invoice: {
        period_start: 1733356800,
        period_end: 1736035200,
      },
    }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_fallback_1",
        created: 600,
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: null,
            status: "active",
            cancel_at: null,
            cancel_at_period_end: false,
            trial_end: null,
            items: { data: [{ price: { id: "price_solo" } }] },
          },
        },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionTier: "business_control",
        subscriptionStatus: "active",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(600 * 1000),
        billingAccessVersion: { increment: 1 },
        trialEndsAt: null,
      },
    })
  })

  test("regression: trial_will_end event records processing without mutating subscription fields", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "business_control",
      pendingDowngradeTier: null,
    }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_regression_trial_end_1",
        created: 700,
        type: "customer.subscription.trial_will_end",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
          },
        },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 0)
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("signed old payload projects ALL fields from the current authoritative read", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123", pendingDowngradeTier: "business_pro" }
    subscriptionRetrieveResponse = currentSubscription({
      status: "trialing", trial_end: 2000000000, cancel_at: 2100000000, cancel_at_period_end: true,
      items: { data: [{ price: { id: "price_business_pro" } }] },
      latest_invoice: { period_start: 1900000000, period_end: 2200000000 },
    })
    const res = await stripeBillingRoute(makeRequest({ id: "evt_current", created: 800,
      type: "customer.subscription.updated", data: { object: currentSubscription({ status: "past_due", metadata: { userId: "user_1" } }) },
    }))
    assert.equal(res.status, 200)
    assert.deepEqual(updateCalls[0].data, {
      subscriptionTier: "business_pro", subscriptionStatus: "trialing", stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123", stripePriceId: "price_business_pro",
      trialEndsAt: new Date(2000000000000), subscriptionCurrentPeriodStart: new Date(1900000000000),
      subscriptionCurrentPeriodEnd: new Date(2200000000000), subscriptionCancelAt: new Date(2100000000000),
      subscriptionCancelAtPeriodEnd: true, latestStripeEventCreatedAt: new Date(800000),
      billingAccessVersion: { increment: 1 },
      pendingDowngradeTier: null, stripeScheduleId: null,
    })
  })

  test("sparse Checkout metadata resolves the bound user and derives the plan from current price", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123" }
    const res = await stripeBillingRoute(makeRequest({ id: "evt_checkout_sparse", created: 801,
      type: "checkout.session.completed", data: { object: {
        id: "cs_123",
        subscription: { id: "sub_123" }, customer: { id: "cus_123" }, metadata: { selectedTier: "business_pro" },
      } },
    }))
    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.equal((updateCalls[0].data as { subscriptionTier: string }).subscriptionTier, "business_control")
    assert.deepEqual(updateCalls[0].where, { userId: "user_1" })
  })

  test("conflicting delivered customer or metadata is rejected before a profile write", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123" }
    for (const delivered of [currentSubscription({ customer: "cus_other" }), currentSubscription({ metadata: { userId: "other" } })]) {
      const response = await stripeBillingRoute(makeRequest({ id: "evt_conflict", created: 802,
        type: "customer.subscription.updated", data: { object: delivered },
      }))
      assert.equal(response.status, 503)
      assert.equal(ledger.rows.get("evt_conflict")?.processingStatus, "failed")
    }
    assert.equal(updateCalls.length, 0)
  })

  test("superseded update/delete/Checkout never replaces the current subscription", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_new" }
    for (const type of ["customer.subscription.updated", "customer.subscription.deleted", "checkout.session.completed"]) {
      if (type === "checkout.session.completed") subscriptionRetrieveResponse = currentSubscription({ status: "canceled" })
      const res = await stripeBillingRoute(makeRequest({ id: `evt_superseded_${type}`, created: 803, type,
        data: { object: type === "checkout.session.completed" ? { id: "cs_123", customer: "cus_123", subscription: "sub_123" } : currentSubscription() },
      }))
      assert.equal(res.status, 200)
    }
    assert.equal(updateCalls.length, 0)
    assert.deepEqual(webhookUpdateCalls.map(({ data }) => (data as { processingNote: string }).processingNote),
      ["superseded_subscription", "superseded_subscription", "superseded_checkout_subscription"])
  })
  test("signed completion retrieves actual session rather than projecting delivered payment or tenant hints", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: null }
    const res = await stripeBillingRoute(makeRequest({ id: "evt_checkout_fresh", created: 804,
      type: "checkout.session.completed", data: { object: { id: "cs_123", customer: "cus_foreign",
        subscription: "sub_foreign", payment_status: "unpaid", metadata: { userId: "foreign" } } },
    }))
    assert.equal(res.status, 200); assert.equal(updateCalls.length, 1)
    assert.equal(ledger.rows.get("evt_checkout_fresh")?.processingStatus, "processed")
  })
  test("signed completion accepts legitimate no-payment-required trial without fabricating active", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: null }
    checkoutSession.payment_status = "no_payment_required"
    subscriptionRetrieveResponse = currentSubscription({ status: "trialing", trial_start: 1800000001, trial_end: 1800000100 })
    const res = await stripeBillingRoute(makeRequest({ id: "evt_checkout_trial", created: 805,
      type: "checkout.session.completed", data: { object: { id: "cs_123" } },
    }))
    assert.equal(res.status, 200); assert.equal((updateCalls[0].data as { subscriptionStatus: string }).subscriptionStatus, "trialing")
  })
  test("unverified completion remains retryable and never writes billing", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123", stripeSubscriptionId: null }
    checkoutSession.payment_status = "unpaid"
    const res = await stripeBillingRoute(makeRequest({ id: "evt_checkout_unpaid", created: 806,
      type: "checkout.session.completed", data: { object: { id: "cs_123" } },
    }))
    assert.equal(res.status, 503); assert.equal(updateCalls.length, 0)
    assert.equal(ledger.rows.get("evt_checkout_unpaid")?.processingStatus, "failed")
  })
})
