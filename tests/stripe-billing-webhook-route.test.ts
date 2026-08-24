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

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          userProfile: {
            findFirst: async () => findFirstProfile,
            update: async (args: { where: unknown; data: unknown }) => {
              updateCalls.push(args)
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
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_123" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_1" },
      data: { subscriptionStatus: "past_due" },
    })
  })

  test("returns 200 and makes no database changes when no UserProfile matches the customer", async () => {
    findFirstProfile = null

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_2",
        type: "invoice.payment_failed",
        data: { object: { customer: "cus_unknown" } },
      }),
    )

    assert.equal(res.status, 200)
    assert.equal(updateCalls.length, 0)
  })

  test("persists subscriptionCancelAt when customer.subscription.updated schedules period-end cancellation", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "solo",
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
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            cancel_at: 1736035200,
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
        subscriptionTier: "solo",
        subscriptionStatus: "active",
        stripeSubscriptionId: "sub_123",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: new Date(1736035200 * 1000),
      },
    })
  })

  test("clears subscriptionCancelAt when customer.subscription.updated removes pending cancellation", async () => {
    findFirstProfile = {
      userId: "user_1",
      stripeCustomerId: "cus_123",
      subscriptionTier: "solo",
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
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_123",
            customer: "cus_123",
            status: "active",
            cancel_at: null,
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
        subscriptionTier: "solo",
        subscriptionStatus: "active",
        stripeSubscriptionId: "sub_123",
        subscriptionCurrentPeriodStart: new Date(1733356800 * 1000),
        subscriptionCurrentPeriodEnd: new Date(1736035200 * 1000),
        subscriptionCancelAt: null,
      },
    })
  })

  test("clears subscriptionCancelAt when customer.subscription.deleted finalizes cancellation", async () => {
    findFirstProfile = { userId: "user_1", stripeCustomerId: "cus_123" }

    const res = await stripeBillingRoute(
      makeRequest({
        id: "evt_test_5",
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
        subscriptionTier: "starter",
        subscriptionStatus: "cancelled",
        subscriptionCancelAt: null,
      },
    })
  })
})
