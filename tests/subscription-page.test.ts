import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { TrialGrantSnapshot, BillingRiskSnapshot } from "@/lib/billing/effectiveAccess"

let mockUser: { id: string } | null = { id: "user-123" }
let mockProfile: {
  subscriptionTier: string | null
  subscriptionStatus: string | null
  subscriptionCurrentPeriodEnd: Date | null
  subscriptionCancelAt: Date | null
  pendingDowngradeTier: string | null
  stripeSubscriptionId: string | null
  trialEndsAt?: Date | null
  billingAccessVersion?: number
} | null = null
let mockGrant: TrialGrantSnapshot | null = null
let mockRisks: BillingRiskSnapshot[] = []
let _redirectedTo: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SubscriptionPage: any

describe("Subscription settings page", () => {
  before(async () => {
    await mock.module("@/lib/billing/billingClientSession", {
      namedExports: { getBillingClientScope: async () => "test-session-scope" },
    })
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
          callback: (tx: {
            userProfile: { findUnique: () => Promise<typeof mockProfile> }
            tenantTrialGrant: { findUnique: () => Promise<TrialGrantSnapshot | null> }
            tenantBillingRisk: { findMany: () => Promise<BillingRiskSnapshot[]> }
          }) => Promise<unknown>,
        ) =>
          callback({
            userProfile: {
              findUnique: async () => mockProfile,
            },
            tenantTrialGrant: { findUnique: async () => mockGrant },
            tenantBillingRisk: { findMany: async () => mockRisks },
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
      subscriptionTier: "business_control",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodEnd: new Date("2026-09-12T00:00:00.000Z"),
      subscriptionCancelAt: null,
      pendingDowngradeTier: null,
      stripeSubscriptionId: "sub_123",
    }
    _redirectedTo = null
    mockGrant = null
    mockRisks = []
  })

  test("passes scheduled cancellation data and success copy to SubscriptionClient", async () => {
    mockProfile = {
      subscriptionTier: "business_control",
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
      subscriptionTier: "essentials",
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

  test("grant display never replaces raw billing tier, lifecycle dates or recovery version/scope", async () => {
    mockProfile!.subscriptionStatus = "canceled"
    mockProfile!.billingAccessVersion = 42
    mockGrant = { plan: "business_pro", startsAt: new Date("2020-01-01Z"), expiresAt: new Date("2099-01-01Z"), revokedAt: null }
    const element = await SubscriptionPage({ searchParams: Promise.resolve({}) })
    assert.equal(element.props.tier, "business_control")
    assert.equal(element.props.status, "canceled")
    assert.equal(element.props.billingAccessVersion, 42)
    assert.equal(element.props.billingSessionScope, "test-session-scope")
    assert.equal(element.props.currentPeriodEnd.toISOString(), "2026-09-12T00:00:00.000Z")
    assert.equal(element.props.canCancelSubscription, false)
    assert.match(element.props.applicationAccess.headline, /Business Pro.*Temporary PaidSoon grant/)
    assert.doesNotMatch(JSON.stringify(element.props), /user-123|sub_123|billingRisks|revokedAt/)
  })

  test("missing and unknown profiles render billing recovery without fabricated active access", async () => {
    for (const missing of [false, true]) {
      if (missing) mockProfile = null
      else mockProfile!.subscriptionStatus = "mystery"
      const element = await SubscriptionPage({ searchParams: Promise.resolve({}) })
      assert.equal(element.props.status, missing ? "unknown" : "mystery")
      assert.equal(element.props.canCancelSubscription, false)
      assert.equal(element.props.applicationAccess.headline, "Application access unavailable")
      assert.equal(element.props.billingSessionScope, "test-session-scope")
      if (missing) assert.equal(element.props.billingAccessVersion, null)
    }
  })

  test("paid plus retained grant presents paid precedence and unchanged raw billing controls", async () => {
    mockGrant = { plan: "business_pro", startsAt: new Date("2020-01-01Z"), expiresAt: new Date("2099-01-01Z"), revokedAt: null }
    const element = await SubscriptionPage({ searchParams: Promise.resolve({}) })
    assert.equal(element.props.tier, "business_control")
    assert.equal(element.props.status, "active")
    assert.equal(element.props.canCancelSubscription, true)
    assert.match(element.props.applicationAccess.headline, /Business Control.*Paid Stripe subscription/)
    assert.match(element.props.applicationAccess.retainedGrant, /Business Pro.*2099/)
    assert.equal(element.props.applicationAccess.continuity, null)
    assert.equal(element.props.hasStripeSubscription, true)
  })
})