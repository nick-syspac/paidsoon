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

const WEBHOOK_SECRET = "whsec_test_dummy_secret"

let updateCalls: Array<{ where: unknown; data: unknown }> = []
let findFirstProfile:
  | {
      userId: string
      stripeCustomerId: string
      subscriptionTier?: string | null
      pendingDowngradeTier?: string | null
    }
  | null = null
let trackedInvoices: Array<{ id: string }> = []
let subscriptionRetrieveResponse: unknown = null
let findUniqueProfile: { latestStripeEventCreatedAt: Date | null } | null = null
let webhookCreateCalls: Array<{ data: unknown }> = []
let webhookUpdateCalls: Array<{ where: unknown; data: unknown }> = []
let webhookCreateShouldThrowCode: string | null = null

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

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          userProfile: {
            findFirst: async () => findFirstProfile,
            findUnique: async () => findUniqueProfile,
            update: async (args: { where: unknown; data: unknown }) => {
              updateCalls.push(args)
              return {}
            },
          },
          stripeBillingWebhookEvent: {
            create: async (args: { data: unknown }) => {
              if (webhookCreateShouldThrowCode) {
                throw { code: webhookCreateShouldThrowCode }
              }
              webhookCreateCalls.push(args)
              return {}
            },
            update: async (args: { where: unknown; data: unknown }) => {
              webhookUpdateCalls.push(args)
              return {}
            },
          },
          trackedInvoice: {
            findMany: async () => trackedInvoices,
            updateMany: async () => ({ count: trackedInvoices.length }),
          },
        },
      },
    })

    await mock.module("@/lib/billing/stripeSubscriptions", {
      namedExports: {
        retrieveSubscriptionWithLatestInvoice: async () => {
          if (subscriptionRetrieveResponse === null) {
            throw new Error("No mocked Stripe subscription response")
          }
          return subscriptionRetrieveResponse as never
        },
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
    subscriptionRetrieveResponse = null
    findUniqueProfile = { latestStripeEventCreatedAt: null }
    webhookCreateCalls = []
    webhookUpdateCalls = []
    webhookCreateShouldThrowCode = null
  })

  test("persists trialing lifecycle fields on customer.subscription.created", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "essentials",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = {
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
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(100 * 1000),
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

  test("marks subscriptionStatus past_due when invoice.payment_failed matches a UserProfile", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123" }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_1",
        created: 0,
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_123" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionStatus: "past_due",
        latestStripeEventCreatedAt: new Date(0),
      },
    })
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("returns 200 and makes no database changes when no UserProfile matches the customer", async () => {
    findFirstProfile = null

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_2",
        created: 0,
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_unknown" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 0)
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("marks active when invoice.paid matches a UserProfile", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123" }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_paid_1",
        created: 200,
        type: "invoice.paid",
        data: { object: { customer: "cus_123" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionStatus: "active",
        latestStripeEventCreatedAt: new Date(200 * 1000),
      },
    })
  })

  test("regression: invoice.payment_failed does not downgrade an existing paid tier", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "business_pro",
      pendingDowngradeTier: null,
    }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_regression_failed_1",
        created: 210,
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_123" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionStatus: "past_due",
        latestStripeEventCreatedAt: new Date(210 * 1000),
      },
    })
  })

  test("persists subscriptionCancelAt when customer.subscription.updated schedules period-end cancellation", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "business_control",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = {
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
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: new Date(1736035200 * 1000),
        subscriptionCancelAtPeriodEnd: true,
        latestStripeEventCreatedAt: new Date(0),
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
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(0),
        trialEndsAt: null,
      },
    })
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("clears subscriptionCancelAt when customer.subscription.deleted finalizes cancellation", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123" }

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
        subscriptionTier: "essentials",
        subscriptionStatus: "canceled",
        stripePriceId: null,
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(0),
        trialEndsAt: null,
      },
    })
    assert.equal(webhookCreateCalls.length, 1)
    assert.equal(webhookUpdateCalls.length, 1)
  })

  test("regression: active subscription update with unknown price keeps existing tier", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "small_business",
      pendingDowngradeTier: null,
    }
    subscriptionRetrieveResponse = {
      latest_invoice: {
        period_start: 1733356800,
        period_end: 1736035200,
      },
    }

    const res = await stripeBillingRoute(
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

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: {
        subscriptionTier: "small_business",
        subscriptionStatus: "active",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_unknown",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(250 * 1000),
        trialEndsAt: null,
      },
    })
  })

  test("returns deduped success for duplicate webhook events", async () => {
    webhookCreateShouldThrowCode = "P2002"

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

  test("skips stale events when a newer Stripe event is already projected", async () => {
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
    assert.equal(updateCalls.length, 0)
    assert.equal(webhookUpdateCalls.length, 1)
    assert.deepEqual(webhookUpdateCalls[0], {
      where: { stripeEventId: "evt_test_stale_1" },
      data: {
        processingStatus: "skipped",
        processingNote: "stale_event",
        processedAt: webhookUpdateCalls[0]?.data && (webhookUpdateCalls[0].data as { processedAt?: unknown }).processedAt,
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
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_solo",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
        latestStripeEventCreatedAt: new Date(600 * 1000),
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
})
