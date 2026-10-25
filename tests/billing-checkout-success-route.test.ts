import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user_123" }
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
let lifecycleCalls: unknown[][] = []
let hasProfile = true
let lifecycleFails = false
let rlsReads = 0

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
              findUnique: () => Promise<unknown>
              update: (args: { where: unknown; data: unknown }) => Promise<unknown>
            }
          }) => Promise<unknown>,
        ) =>
          callback({
            userProfile: {
              findUnique: async () => { rlsReads++; return hasProfile ? { userId: "user_123", stripeCustomerId: "cus_123", stripeSubscriptionId: null } : null },
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
        createStripeClient: () => ({ mockedProvider: true }),
      },
    })

    await mock.module("@/lib/billing/hostedCheckoutLifecycle", {
      namedExports: {
        reconcileHostedCheckout: async (...args: unknown[]) => {
          assert.equal(rlsReads, 1, "RLS ownership read precedes privileged lifecycle")
          lifecycleCalls.push(args)
          if (lifecycleFails) throw new Error("provider unavailable")
          return completionResult ? { kind: "current", snapshot: completionResult } : { kind: "incomplete" }
        },
      },
    })

    ;({ GET: routeGet } = await import("@/app/api/billing/checkout/success/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user_123" }
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
    lifecycleCalls = []; hasProfile = true; lifecycleFails = false; rlsReads = 0
  })

  test("reconciles and links Stripe customer/subscription IDs after checkout", async () => {
    const res = await routeGet(
      new Request(
        "http://localhost:3000/api/billing/checkout/success?session_id=cs_test_123&tier=business_pro",
      ),
    )

    assert.equal(res.status, 307)
    assert.equal(
      res.headers.get("location"),
      "https://app.example.com/settings/subscription?success=upgraded&tier=business_control",
    )
    assert.equal(updateCalls.length, 0, "customer role never writes billing columns")
    assert.deepEqual(lifecycleCalls, [[{ mockedProvider: true }, "user_123", "cs_test_123", { kind: "hosted_lifecycle" }]])
  })
  test("unauthenticated return redirects to sign-in before RLS/provider access", async () => {
    mockUser = null
    const res = await routeGet(new Request("https://app.example.com/api/billing/checkout/success?session_id=cs_1"))
    assert.equal(res.status, 307); assert.equal(res.headers.get("location"), "https://app.example.com/sign-in")
    assert.equal(rlsReads, 0); assert.equal(lifecycleCalls.length, 0)
  })
  test("GET requires no POST origin/version/idempotency headers and preserves redirect on verification failure", async () => {
    lifecycleFails = true
    const res = await routeGet(new Request("https://app.example.com/api/billing/checkout/success?session_id=cs_1"))
    assert.equal(res.status, 307)
    assert.equal(res.headers.get("location"), "https://app.example.com/settings/subscription?success=upgraded")
    assert.equal(lifecycleCalls.length, 1); assert.equal(updateCalls.length, 0)
  })
  test("missing own RLS profile prevents privileged lifecycle access", async () => {
    hasProfile = false
    const res = await routeGet(new Request("https://app.example.com/api/billing/checkout/success?session_id=cs_1"))
    assert.equal(res.status, 307); assert.equal(lifecycleCalls.length, 0)
  })
  for (const query of ["", "?session_id=invalid", "?session_id=cs_%3Cscript%3E"]) {
    test(`missing/malformed session redirects without provider calls: ${query}`, async () => {
      const res = await routeGet(new Request(`https://app.example.com/api/billing/checkout/success${query}`))
      assert.equal(res.status, 307); assert.equal(lifecycleCalls.length, 0)
    })
  }
})
