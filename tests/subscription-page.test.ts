import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let mockProfile: {
  subscriptionTier: string | null
  subscriptionStatus: string | null
  subscriptionCurrentPeriodEnd: Date | null
  subscriptionCancelAt: Date | null
  pendingDowngradeTier: string | null
  stripeSubscriptionId: string | null
} | null = null
let _redirectedTo: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SubscriptionPage: any

describe("Subscription settings page", () => {
  before(async () => {
    await mock.module("next/navigation", {
      namedExports: {
        redirect: (url: string) => {
          _redirectedTo = url
          throw new Error("NEXT_REDIRECT")
        },
      },
    })

    await mock.module("@/lib/supabase/server", {
      namedExports: {
        getAuthenticatedUser: async () => ({ data: { user: mockUser } }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (
          _userId: string,
          callback: (tx: { userProfile: { findUnique: () => Promise<typeof mockProfile> } }) => Promise<unknown>,
        ) =>
          callback({
            userProfile: {
              findUnique: async () => mockProfile,
            },
          }),
      },
    })

    await mock.module("@/components/settings/SubscriptionClient", {
      namedExports: {
        SubscriptionClient: (props: unknown) => ({ type: "mock-subscription-client", props }) as unknown,
      },
    })

    ;({ default: SubscriptionPage } = await import("@/app/dashboard/settings/subscription/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockProfile = {
      subscriptionTier: "solo",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
      subscriptionCancelAt: null,
      pendingDowngradeTier: null,
      stripeSubscriptionId: "sub_123",
    }
    _redirectedTo = null
  })

  test("passes scheduled cancellation data and success copy to SubscriptionClient", async () => {
    mockProfile = {
      subscriptionTier: "solo",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
      subscriptionCancelAt: new Date("2026-09-12T00:00:00.000Z"),
      pendingDowngradeTier: null,
      stripeSubscriptionId: "sub_123",
    }

    const element = await SubscriptionPage({
      searchParams: Promise.resolve({
        cancellation: "scheduled",
        cancelAt: "2026-09-12T00:00:00.000Z",
      }),
    })

    assert.equal(element?.props?.subscriptionCancelAt?.toISOString(), "2026-09-12T00:00:00.000Z")
    assert.equal(element?.props?.canCancelSubscription, true)
    assert.equal(element?.props?.successMessage, "Your cancellation is scheduled for 12 September 2026.")
  })

  test("passes trial-only state without cancel capability", async () => {
    mockProfile = {
      subscriptionTier: "starter",
      subscriptionStatus: "trialing",
      subscriptionCurrentPeriodEnd: null,
      subscriptionCancelAt: null,
      pendingDowngradeTier: null,
      stripeSubscriptionId: null,
    }

    const element = await SubscriptionPage({
      searchParams: Promise.resolve({}),
    })

    assert.equal(element?.props?.status, "trialing")
    assert.equal(element?.props?.subscriptionCancelAt, null)
    assert.equal(element?.props?.canCancelSubscription, false)
  })
})