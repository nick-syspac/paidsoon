import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let mockProfile: {
  subscriptionStatus: string | null
  subscriptionCurrentPeriodEnd: Date | null
  subscriptionCancelAt: Date | null
  stripeSubscriptionId: string | null
} | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SubscriptionCancellationPage: any

describe("Subscription cancellation page", () => {
  before(async () => {
    await mock.module("next/navigation", {
      namedExports: {
        redirect: () => {
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

    await mock.module("@/components/settings/SubscriptionCancellationClient", {
      namedExports: {
        SubscriptionCancellationClient: (props: unknown) => ({ type: "mock-cancel-client", props }) as unknown,
      },
    })

    ;({ default: SubscriptionCancellationPage } = await import("@/app/dashboard/settings/subscription/cancel/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockProfile = {
      subscriptionStatus: "active",
      subscriptionCurrentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
      subscriptionCancelAt: null,
      stripeSubscriptionId: "sub_123",
    }
  })

  test("renders confirmation copy for active subscribers", async () => {
    const element = await SubscriptionCancellationPage()

    assert.equal(element?.props?.title, "Are you sure?")
    assert.equal(
      element?.props?.description,
      "Your plan will remain active until 12 September 2026, and you will not be charged again after that date.",
    )
    assert.equal(element?.props?.confirmLabel, "Continue to Stripe")
    assert.equal(element?.props?.confirmDisabled, false)
  })

  test("renders trial-only copy when there is no active Stripe subscription", async () => {
    mockProfile = {
      subscriptionStatus: "trialing",
      subscriptionCurrentPeriodEnd: null,
      subscriptionCancelAt: null,
      stripeSubscriptionId: null,
    }

    const element = await SubscriptionCancellationPage()

    assert.equal(element?.props?.title, "Are you sure?")
    assert.equal(
      element?.props?.description,
      "You're on a free trial with no active paid subscription yet. Ending it now will stop the trial and return you to the subscription settings page.",
    )
    assert.equal(element?.props?.confirmLabel, "End free trial")
    assert.equal(element?.props?.confirmDisabled, false)
  })
})