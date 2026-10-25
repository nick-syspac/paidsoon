import { before, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type Stripe from "stripe"
import type { UserProfile } from "@/lib/generated/prisma/client"

const tenant = "11111111-1111-4111-8111-111111111111"
const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const env: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_APP_URL: "https://paidsoon.test",
  STRIPE_STARTER_PRICE_ID: "price_essentials",
  STRIPE_SOLO_PRICE_ID: "price_business_control",
  STRIPE_SMALL_BUSINESS_PRICE_ID: "price_small_business",
  STRIPE_BUSINESS_PRO_PRICE_ID: "price_business_pro",
  STRIPE_TRIAL_PERIOD_DAYS: "21",
}
const profile = { userId: tenant, stripeCustomerId: "cus_existing", stripeSubscriptionId: null,
  stripeScheduleId: null, subscriptionTier: "essentials" } as UserProfile
let planApi: typeof import("@/lib/billing/customerBillingPlan")

describe("Checkout frozen purchase contract (no DB or provider)", () => {
  before(async () => {
    await mock.module("server-only", { namedExports: {} })
    planApi = await import("@/lib/billing/customerBillingPlan")
  })
  for (const [tier, price] of [
    ["essentials", "price_essentials"], ["business_control", "price_business_control"],
    ["small_business", "price_small_business"], ["business_pro", "price_business_pro"],
  ] as const) {
    test(`${tier} retains its configured price, quantity,21-day trial and correlated metadata`, () => {
      const intent = planApi.normalizeCustomerBillingIntent("checkout", tier)
      const frozen = planApi.freezeCustomerBillingPlan(intent, profile, null, env)
      const step = planApi.initialBillingStep("checkout_create", frozen, "cus_existing", tenant, operationId)
      const params = step.normalizedRequest as unknown as Stripe.Checkout.SessionCreateParams
      assert.deepEqual(params.line_items, [{ price, quantity: 1 }])
      assert.equal(params.subscription_data?.trial_period_days, 21)
      assert.equal(params.subscription_data?.metadata?.operationId, operationId)
      assert.equal(params.metadata?.userId, tenant); assert.equal(params.metadata?.selectedTier, tier)
      assert.equal(params.success_url, `https://paidsoon.test/api/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`)
      assert.equal(params.cancel_url, "https://paidsoon.test/settings/subscription?cancelled=true")
      assert.equal(step.objectTarget, "/v1/checkout/sessions"); assert.equal(step.method, "POST")
    })
  }
  test("disabled/invalid trial configuration does not create a synthetic trial", () => {
    for (const setting of ["0", "-1", "not-a-number", "Infinity"]) {
      const frozen = planApi.freezeCustomerBillingPlan({ kind: "checkout", tier: "small_business" }, profile, null,
        { ...env, STRIPE_TRIAL_PERIOD_DAYS: setting })
      const params = planApi.initialBillingStep("checkout_create", frozen, "cus_existing", tenant, operationId)
        .normalizedRequest as unknown as Stripe.Checkout.SessionCreateParams
      assert.equal(params.subscription_data?.trial_period_days, undefined)
      assert.equal(params.subscription_data?.metadata?.operationId, operationId)
    }
  })
  test("active/trialing duplicate uses actual Stripe price even with a stale local profile tier", () => {
    for (const status of ["active", "trialing"] as const) {
      const subscription = { id: "sub_existing", status, items: { data: [{ id: "si_existing", price: { id: "price_small_business" } }] },
        latest_invoice: null } as unknown as Stripe.Subscription
      assert.throws(() => planApi.freezeCustomerBillingPlan({ kind: "checkout", tier: "small_business" }, profile, subscription, env),
        { code: "billing_already_active" })
      assert.throws(() => planApi.freezeCustomerBillingPlan({ kind: "checkout", tier: "business_control" }, profile, subscription, env),
        { code: "billing_use_downgrade" })
    }
  })
  test("frozen provider params cannot change when app URL, price and trial environment later change", () => {
    const config = { ...env }
    const frozen = planApi.freezeCustomerBillingPlan({ kind: "checkout", tier: "essentials" }, profile, null, config)
    const original = planApi.initialBillingStep("checkout_create", frozen, "cus_existing", tenant, operationId)
    config.NEXT_PUBLIC_APP_URL = "https://changed.test"; config.STRIPE_STARTER_PRICE_ID = "changed_price"
    config.STRIPE_TRIAL_PERIOD_DAYS = "30"
    assert.deepEqual(planApi.initialBillingStep("checkout_create", frozen, "cus_existing", tenant, operationId), original)
    assert.equal(JSON.stringify(original).includes("changed"), false)
  })
})
