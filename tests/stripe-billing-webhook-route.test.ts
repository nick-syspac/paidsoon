/**
 * Route handler tests for the Stripe billing webhook
 * (app/api/webhooks/stripe-billing/route.ts). Covers the invoice.payment_failed
 * handler. Uses the real `stripe` package's own test-signature helper to
 * produce a validly signed request (no network calls), and Node's built-in
 * mock.module() to stub prismaAdmin — no real DB calls are made.
 */
import { describe, test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"
import Stripe from "stripe"

const WEBHOOK_SECRET = "whsec_test_dummy_secret"

let updateCalls: Array<{ where: unknown; data: unknown }> = []
let findFirstProfile: { userId: string; stripeCustomerId: string } | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stripeBillingRoute: any

describe("Stripe billing webhook", () => {
  before(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = WEBHOOK_SECRET

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
        },
      },
    })

    ;({ POST: stripeBillingRoute } = await import("@/app/api/webhooks/stripe-billing/route"))
  })

  beforeEach(() => {
    updateCalls = []
    findFirstProfile = null
  })

  const stripe = new Stripe("sk_test_dummy", { apiVersion: "2026-05-27.dahlia" })

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
})
