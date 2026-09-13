import { after, before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

interface MockProfile {
  userId: string
  subscriptionTier: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

let mockUser: { id: string; email?: string | null } | null = {
  id: "user_123",
  email: "user@example.com",
}
let profileSequence: Array<MockProfile | null> = []
let profileUpdateCalls: Array<{ where: unknown; data: unknown }> = []

let customerCreateCalls: Array<Record<string, unknown>> = []
let checkoutCreateCalls: Array<Record<string, unknown>> = []
let subscriptionUpdateCalls: Array<{ subscriptionId: string; args: unknown }> = []
let subscriptionRetrieveResponse: { id: string; status: string } | null = null
let subscriptionsListResponse: Array<{ id: string; status: string }> = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let routePost: any

describe("POST /api/billing/checkout", () => {
  before(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_not_for_output"
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com"
    process.env.STRIPE_TRIAL_PERIOD_DAYS = "21"
    process.env.STRIPE_STARTER_PRICE_ID = "price_essentials"
    process.env.STRIPE_SOLO_PRICE_ID = "price_business_control"
    process.env.STRIPE_SMALL_BUSINESS_PRICE_ID = "price_small_business"
    process.env.STRIPE_BUSINESS_PRO_PRICE_ID = "price_business_pro"

    await mock.module("@/lib/billing/stripeClient", {
      namedExports: {
        createStripeClient: () => ({
          customers: {
            create: async (args: Record<string, unknown>) => {
              customerCreateCalls.push(args)
              return { id: "cus_new" }
            },
          },
          subscriptions: {
            retrieve: async () => {
              if (!subscriptionRetrieveResponse) {
                throw new Error("not found")
              }
              return subscriptionRetrieveResponse
            },
            list: async () => ({
              data: subscriptionsListResponse,
            }),
            update: async (subscriptionId: string, args: unknown) => {
              subscriptionUpdateCalls.push({ subscriptionId, args })
              return { id: subscriptionId, status: "active" }
            },
          },
          checkout: {
            sessions: {
              create: async (args: Record<string, unknown>) => {
                checkoutCreateCalls.push(args)
                return { url: "https://checkout.stripe.test/session_123" }
              },
            },
          },
        }),
      },
    })

    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/actions/auth", {
      namedExports: {
        createUserProfile: async () => {},
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (
          _userId: string,
          callback: (tx: {
            userProfile: {
              findUnique: (args: unknown) => Promise<MockProfile | null>
              update: (args: { where: unknown; data: unknown }) => Promise<unknown>
            }
          }) => Promise<unknown>,
        ) =>
          callback({
            userProfile: {
              findUnique: async (_args: unknown) => profileSequence.shift() ?? null,
              update: async (args: { where: unknown; data: unknown }) => {
                profileUpdateCalls.push(args)
                return {}
              },
            },
          }),
      },
    })

    ;({ POST: routePost } = await import("@/app/api/billing/checkout/route"))
  })

  after(() => {})

  beforeEach(() => {
    mockUser = { id: "user_123", email: "user@example.com" }
    profileSequence = []
    profileUpdateCalls = []
    customerCreateCalls = []
    checkoutCreateCalls = []
    subscriptionUpdateCalls = []
    subscriptionRetrieveResponse = null
    subscriptionsListResponse = []
  })

  test("creates Stripe checkout session with configured trial days for eligible tier", async () => {
    profileSequence = [
      {
        userId: "user_123",
        subscriptionTier: "essentials",
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: null,
      },
    ]

    const res = await routePost(
      new Request("http://localhost:3000/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "small_business" }),
        headers: { "content-type": "application/json" },
      }),
    )
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.equal(data.url, "https://checkout.stripe.test/session_123")
    assert.equal(checkoutCreateCalls.length, 1)
    assert.equal(
      (checkoutCreateCalls[0].subscription_data as { trial_period_days?: number }).trial_period_days,
      21,
    )
  })

  test("maps each plan to the correct Stripe price ID", async () => {
    const expected: Array<{ tier: string; price: string }> = [
      { tier: "essentials", price: "price_essentials" },
      { tier: "business_control", price: "price_business_control" },
      { tier: "small_business", price: "price_small_business" },
      { tier: "business_pro", price: "price_business_pro" },
    ]

    for (const item of expected) {
      profileSequence = [
        {
          userId: "user_123",
          subscriptionTier: "essentials",
          stripeCustomerId: "cus_existing",
          stripeSubscriptionId: null,
        },
      ]
      checkoutCreateCalls = []

      const res = await routePost(
        new Request("http://localhost:3000/api/billing/checkout", {
          method: "POST",
          body: JSON.stringify({ tier: item.tier }),
          headers: { "content-type": "application/json" },
        }),
      )

      assert.equal(res.status, 200)
      assert.equal(checkoutCreateCalls.length, 1)
      const lineItems = checkoutCreateCalls[0].line_items as Array<{ price: string }>
      assert.equal(lineItems[0]?.price, item.price)
    }
  })

  test("duplicate active subscription checkout request is rejected", async () => {
    profileSequence = [
      {
        userId: "user_123",
        subscriptionTier: "essentials",
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: "sub_123",
      },
    ]
    subscriptionRetrieveResponse = { id: "sub_123", status: "active" }

    const res = await routePost(
      new Request("http://localhost:3000/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "essentials" }),
        headers: { "content-type": "application/json" },
      }),
    )
    const body = await res.json()

    assert.equal(res.status, 409)
    assert.equal(body.error, "Subscription already active for this plan")
    assert.equal(checkoutCreateCalls.length, 0)
    assert.equal(subscriptionUpdateCalls.length, 0)
  })

  test("checkout error payloads never expose Stripe secret key", async () => {
    profileSequence = [
      {
        userId: "user_123",
        subscriptionTier: "essentials",
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: "sub_123",
      },
    ]
    subscriptionRetrieveResponse = { id: "sub_123", status: "active" }

    const res = await routePost(
      new Request("http://localhost:3000/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "essentials" }),
        headers: { "content-type": "application/json" },
      }),
    )
    const body = await res.json()

    assert.equal(res.status, 409)
    const serialized = JSON.stringify(body)
    assert.equal(serialized.includes("sk_test_not_for_output"), false)
    assert.equal(serialized.includes("STRIPE_SECRET_KEY"), false)
  })
})
