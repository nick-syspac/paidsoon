import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user_123" }
let retrievedSession: {
  metadata?: Record<string, string>
  payment_status?: string
} = {
  metadata: { userId: "user_123" },
  payment_status: "paid",
}
let completionResult: {
  tier: "business_control"
  subscriptionId: string
  customerId: string
  status: "active"
  priceId: string
  periodStart: Date
  periodEnd: Date
  trialEndsAt: Date | null
  subscriptionCancelAt: Date | null
  subscriptionCancelAtPeriodEnd: boolean
} | null = null
let updateCalls: Array<{ where: unknown; data: unknown }> = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let routeGet: any

describe("GET /api/billing/checkout/success", () => {
  before(async () => {
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
              update: (args: { where: unknown; data: unknown }) => Promise<unknown>
            }
          }) => Promise<unknown>,
        ) =>
          callback({
            userProfile: {
              update: async (args: { where: unknown; data: unknown }) => {
                updateCalls.push(args)
                return {}
              },
            },
          }),
      },
    })

    await mock.module("@/lib/billing/stripeClient", {
      namedExports: {
        createStripeClient: () => ({
          checkout: {
            sessions: {
              retrieve: async () => retrievedSession,
            },
          },
        }),
      },
    })

    await mock.module("@/lib/billing", {
      namedExports: {
        resolveCheckoutCompletion: async () => completionResult,
      },
    })

    ;({ GET: routeGet } = await import("@/app/api/billing/checkout/success/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user_123" }
    retrievedSession = {
      metadata: { userId: "user_123" },
      payment_status: "paid",
    }
    completionResult = {
      tier: "business_control",
      subscriptionId: "sub_123",
      customerId: "cus_123",
      status: "active",
      priceId: "price_business_control",
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-10-01T00:00:00.000Z"),
      trialEndsAt: null,
      subscriptionCancelAt: null,
      subscriptionCancelAtPeriodEnd: false,
    }
    updateCalls = []
  })

  test("reconciles and links Stripe customer/subscription IDs after checkout", async () => {
    const res = await routeGet(
      new Request(
        "http://localhost:3000/api/billing/checkout/success?session_id=cs_test_123&tier=business_control",
      ),
    )

    assert.equal(res.status, 307)
    assert.equal(
      res.headers.get("location"),
      "https://app.example.com/dashboard/settings/subscription?success=upgraded&tier=business_control",
    )
    assert.equal(updateCalls.length, 1)
    assert.deepEqual(updateCalls[0], {
      where: { userId: "user_123" },
      data: {
        subscriptionTier: "business_control",
        subscriptionStatus: "active",
        trialEndsAt: null,
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripePriceId: "price_business_control",
        subscriptionCurrentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
        subscriptionCurrentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
        subscriptionCancelAt: null,
        subscriptionCancelAtPeriodEnd: false,
      },
    })
  })
})
