import { after, before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string; email?: string | null } | null = { id: "user_123", email: "user@example.com" }
let mockProfile: {
  userId: string
  subscriptionStatus: string | null
  subscriptionTier: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionCurrentPeriodEnd: Date | null
} | null = null
let updateCalls: Array<{ where: unknown; data: unknown }> = []
let listedSubscriptions: unknown[] = []
let retrievedSubscription: unknown = null
let portalCreateCalls: Array<Record<string, unknown>> = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cancelRoutePost: any

describe("POST /api/billing/cancel", () => {
  before(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com"

    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (
          _userId: string,
          callback: (tx: {
            userProfile: {
              findUnique: () => Promise<typeof mockProfile>
              update: (args: { where: unknown; data: unknown }) => Promise<unknown>
            }
          }) => Promise<unknown>,
        ) =>
          callback({
            userProfile: {
              findUnique: async () => mockProfile,
              update: async (args: { where: unknown; data: unknown }) => {
                updateCalls.push(args)
                return {}
              },
            },
          }),
      },
    })

    await mock.module("@/lib/billing/stripeSubscriptions", {
      namedExports: {
        listCustomerSubscriptions: async () => ({ data: listedSubscriptions }),
        retrieveSubscriptionWithLatestInvoice: async () => {
          if (retrievedSubscription === null) {
            throw new Error("No mocked subscription")
          }
          return retrievedSubscription as never
        },
        createSubscriptionCancellationPortalSession: async (
          _stripe: unknown,
          args: Record<string, unknown>,
        ) => {
          portalCreateCalls.push(args)
          return { url: "https://billing.stripe.com/session/test" } as never
        },
      },
    })

    ;({ POST: cancelRoutePost } = await import("@/app/api/billing/cancel/route"))
  })

  after(() => {})

  beforeEach(() => {
    mockUser = { id: "user_123", email: "user@example.com" }
    mockProfile = null
    updateCalls = []
    listedSubscriptions = []
    retrievedSubscription = null
    portalCreateCalls = []
  })

  test("returns 401 when the request is unauthenticated", async () => {
    mockUser = null

    const res = await cancelRoutePost()

    assert.equal(res.status, 401)
    assert.equal(portalCreateCalls.length, 0)
  })

  test("creates a subscription_cancel portal flow for an active subscription found from the customer record", async () => {
    mockProfile = {
      userId: "user_123",
      subscriptionStatus: "active",
      subscriptionTier: "starter",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
    }
    listedSubscriptions = [
      {
        id: "sub_123",
        status: "active",
      },
    ]
    retrievedSubscription = {
      id: "sub_123",
      status: "active",
      latest_invoice: {
        period_end: 1736035200,
      },
    }

    const res = await cancelRoutePost()
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.deepEqual(data, { url: "https://billing.stripe.com/session/test" })
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_123" },
      data: { stripeSubscriptionId: "sub_123" },
    })
    assert.equal(portalCreateCalls.length, 1)
    assert.deepEqual(portalCreateCalls[0], {
      customer: "cus_123",
      return_url: "https://app.example.com/dashboard/settings/subscription",
      flow_data: {
        type: "subscription_cancel",
        subscription_cancel: {
          subscription: "sub_123",
        },
        after_completion: {
          type: "redirect",
          redirect: {
            return_url: "https://app.example.com/dashboard/settings/subscription?cancellation=scheduled&cancelAt=2025-01-05T00%3A00%3A00.000Z",
          },
        },
      },
    })
  })

  test("returns 400 when no active subscription exists and does not create a portal session", async () => {
    mockProfile = {
      userId: "user_123",
      subscriptionStatus: "active",
      subscriptionTier: "solo",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
    }

    const res = await cancelRoutePost()
    const data = await res.json()

    assert.equal(res.status, 400)
    assert.deepEqual(data, { error: "No active subscription found" })
    assert.equal(portalCreateCalls.length, 0)
    assert.equal(updateCalls.length, 0)
  })

  test("ends a free trial locally without creating a Stripe session", async () => {
    mockProfile = {
      userId: "user_123",
      subscriptionStatus: "trialing",
      subscriptionTier: "starter",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
    }

    const res = await cancelRoutePost()
    const data = await res.json()

    assert.equal(res.status, 200)
    assert.deepEqual(data, {
      redirectUrl: "https://app.example.com/dashboard/settings/subscription?cancellation=ended",
    })
    assert.equal(portalCreateCalls.length, 0)
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_123" },
      data: {
        subscriptionStatus: "cancelled",
        subscriptionTier: "starter",
        trialEndsAt: null,
        subscriptionCancelAt: null,
        pendingDowngradeTier: null,
        stripeScheduleId: null,
      },
    })
  })
})