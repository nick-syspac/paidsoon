import { before, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import type Stripe from "stripe"
import {
  reconcileStripeSubscription,
  resolveStripeBillingProfile,
  stripeObjectId,
  stripeSnapshotProfileData,
  stripeTierForPrice,
  stripeTimestamp,
  type StripeBillingBinding,
} from "@/lib/billing/stripeSubscriptions"

const binding: StripeBillingBinding = {
  userId: "tenant_1", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1",
}

function subscription(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1", customer: "cus_1", metadata: {}, status: "trialing",
    items: { data: [{ price: { id: "price_control" } }], has_more: false },
    trial_end: 2000, cancel_at: 3000, cancel_at_period_end: true,
    latest_invoice: {
      customer: { id: "cus_1" }, period_start: 1000, period_end: 4000,
      parent: { subscription_details: { subscription: "sub_1" } },
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

function reconcile(current = subscription(), sources: Stripe.Subscription[] = []) {
  return reconcileStripeSubscription(current, { subscriptionId: "sub_1", binding, sources })
}

describe("verified Stripe subscription snapshot", () => {
  before(() => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_essentials"
    process.env.STRIPE_SOLO_PRICE_ID = "price_control"
    process.env.STRIPE_SMALL_BUSINESS_PRICE_ID = "price_small"
    process.env.STRIPE_BUSINESS_PRO_PRICE_ID = "price_pro"
  })

  test("all lifecycle fields come from current rather than delivered state", () => {
    const delivered = subscription({
      status: "active", trial_end: null, cancel_at: null, cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_pro" } }] },
      latest_invoice: { period_start: 1, period_end: 2 },
    })
    const result = reconcile(subscription(), [delivered])
    assert.equal(result.kind, "current")
    if (result.kind !== "current") assert.fail("expected current snapshot")
    assert.deepEqual(stripeSnapshotProfileData(result.snapshot), {
      subscriptionTier: "business_control", subscriptionStatus: "trialing",
      stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1", stripePriceId: "price_control",
      trialEndsAt: new Date(2000000), subscriptionCurrentPeriodStart: new Date(1000000),
      subscriptionCurrentPeriodEnd: new Date(4000000), subscriptionCancelAt: new Date(3000000),
      subscriptionCancelAtPeriodEnd: true,
    })
  })

  test("returned extension trial end and current invoice dates replace old values, without a local maximum", () => {
    for (const trialEnd of [1500, 9000, null]) {
      const result = reconcile(subscription({ trial_end: trialEnd, status: "past_due" }), [subscription()])
      assert.equal(result.kind, "current")
      if (result.kind !== "current") assert.fail()
      assert.equal(result.snapshot.trialEndsAt?.getTime() ?? null, trialEnd === null ? null : trialEnd * 1000)
      assert.equal(result.snapshot.status, "past_due")
      assert.equal(result.snapshot.tier, "business_control")
      assert.equal(result.snapshot.periodEnd?.getTime(), 4000000)
    }
  })

  test("sparse current metadata preserves the bound tenant and validates delivered metadata", () => {
    assert.equal(reconcile(subscription({ metadata: undefined }), [subscription({ metadata: { userId: "tenant_1" } })]).kind, "current")
    assert.throws(() => reconcile(subscription(), [subscription({ metadata: { userId: "tenant_other" } })]), /conflicting_stripe_binding/)
    assert.throws(() => reconcile(subscription({ metadata: { userId: "tenant_1", user_id: "tenant_other" } })), /conflicting_stripe_identity/)
  })

  test("customer IDs accept expanded/unexpanded forms but reject conflicts or absent authoritative customer", () => {
    assert.equal(stripeObjectId("cus_1"), "cus_1")
    assert.equal(stripeObjectId({ id: "cus_1" }), "cus_1")
    assert.equal(reconcile(subscription({ customer: { id: "cus_1" } })).kind, "current")
    assert.throws(() => reconcile(subscription({ customer: "cus_other" })), /conflicting_stripe_binding/)
    assert.throws(() => reconcile(subscription(), [subscription({ customer: { id: "cus_other" } })]), /conflicting_stripe_identity/)
    assert.throws(() => reconcile(subscription({ customer: null })), /missing_stripe_customer/)
    assert.throws(() => stripeObjectId({ id: "" }), /invalid_stripe_id/)
  })

  test("superseded subscription is recognized without rebinding or projecting its lifecycle", () => {
    assert.deepEqual(reconcileStripeSubscription(subscription({ id: "sub_old" }), {
      subscriptionId: "sub_old", binding,
    }), { kind: "superseded" })
    assert.throws(() => reconcile(subscription({ id: "sub_other" })), /conflicting_stripe_subscription/)
    assert.throws(() => reconcileStripeSubscription(subscription({ id: "sub_old", customer: "cus_other" }), {
      subscriptionId: "sub_old", binding,
    }), /conflicting_stripe_binding/)
  })

  test("only the four canonical price mappings are accepted; unknown and duplicate configuration fail closed", () => {
    for (const [price, tier] of [["price_essentials", "essentials"], ["price_control", "business_control"],
      ["price_small", "small_business"], ["price_pro", "business_pro"]]) {
      assert.equal(stripeTierForPrice(price), tier)
    }
    assert.throws(() => stripeTierForPrice("price_unknown"), /unknown_or_ambiguous_stripe_price/)
    process.env.STRIPE_BUSINESS_PRO_PRICE_ID = "price_control"
    try {
      assert.throws(() => stripeTierForPrice("price_control"), /unknown_or_ambiguous_stripe_price/)
    } finally {
      process.env.STRIPE_BUSINESS_PRO_PRICE_ID = "price_pro"
    }
  })

  test("unsupported/missing prices, items and unexpanded invoices cannot form a snapshot", () => {
    for (const items of [{ data: [] }, { data: [{ price: null }] },
      { data: [{ price: { id: "price_unknown" } }] },
      { data: [{ price: { id: "price_control" } }], has_more: true },
      { data: [{ price: { id: "price_control" } }, { price: { id: "price_pro" } }] }]) {
      assert.throws(() => reconcile(subscription({ items })))
    }
    assert.throws(() => reconcile(subscription({ latest_invoice: "in_1" })), /stripe_invoice_not_expanded/)
    assert.throws(() => reconcile(subscription({ latest_invoice: { customer: "cus_other" } })), /conflicting_stripe_invoice_customer/)
    assert.throws(() => reconcile(subscription({ latest_invoice: { parent: { subscription_details: { subscription: "sub_other" } } } })), /conflicting_stripe_invoice_subscription/)
    assert.throws(() => reconcile(subscription({ status: "unknown" })), /invalid_stripe_lifecycle/)
  })

  test("timestamp conversion is nullable and epoch-safe, rejecting unsafe/fractional/nonfinite/negative values", () => {
    assert.equal(stripeTimestamp(null), null)
    assert.equal(stripeTimestamp(undefined), null)
    assert.equal(stripeTimestamp(0)?.getTime(), 0)
    for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, 8640000000001]) {
      assert.throws(() => stripeTimestamp(value), /invalid_stripe_timestamp/)
      assert.throws(() => reconcile(subscription({ trial_end: value })), /invalid_stripe_timestamp/)
      assert.throws(() => reconcile(subscription({ cancel_at: value })), /invalid_stripe_timestamp/)
      assert.throws(() => reconcile(subscription({ latest_invoice: { period_end: value } })), /invalid_stripe_timestamp/)
    }
    assert.throws(() => reconcile(subscription({ latest_invoice: { period_start: 5, period_end: 4 } })), /invalid_stripe_period/)
    assert.equal(reconcile(subscription({ latest_invoice: null })).kind, "current")
  })

  test("profile resolution retains bound user with sparse metadata and validates every identifier lookup", async () => {
    const lookup = {
      byUserId: async () => null as StripeBillingBinding | null,
      byCustomerId: async () => binding as StripeBillingBinding | null,
      bySubscriptionId: async () => binding as StripeBillingBinding | null,
    }
    assert.deepEqual(await resolveStripeBillingProfile(lookup, [{ metadata: {}, customer: { id: "cus_1" } }], "sub_1"), binding)
    assert.deepEqual(await resolveStripeBillingProfile(lookup, [{}], "sub_1"), binding)
    assert.deepEqual(await resolveStripeBillingProfile(lookup, [{ customer: "cus_1" }], "sub_old"), binding)
    await assert.rejects(resolveStripeBillingProfile(lookup, [{ customer: "cus_1", metadata: { userId: "other" } }], "sub_1"), /conflicting_stripe_binding/)
    await assert.rejects(resolveStripeBillingProfile({ ...lookup, bySubscriptionId: async () => ({ ...binding, userId: "other" }) }, [{ customer: "cus_1" }], "sub_1"), /conflicting_stripe_binding/)
    await assert.rejects(resolveStripeBillingProfile({ ...lookup, byUserId: async () => binding }, [{ customer: "cus_other", metadata: { userId: "tenant_1" } }], null), /conflicting_stripe_binding/)
    assert.equal(await resolveStripeBillingProfile(lookup, [{}], null), null)
  })
})

describe("Checkout completion uses the shared current snapshot", () => {
  let resolveCheckoutCompletion: typeof import("@/lib/billing").resolveCheckoutCompletion
  before(async () => {
    await mock.module("@/lib/billing/effectiveAccessLoader", { namedExports: { getEffectiveAccess: async () => { throw new Error("Unexpected access lookup") } } })
    ;({ resolveCheckoutCompletion } = await import("@/lib/billing"))
  })

  function session(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
    return { customer: { id: "cus_1" }, subscription: { id: "sub_1" }, metadata: { userId: "tenant_1", selectedTier: "business_pro" }, ...overrides } as unknown as Stripe.Checkout.Session
  }

  function client(current: Stripe.Subscription): Stripe {
    return { subscriptions: { retrieve: async (id: string, params: unknown) => {
      assert.equal(id, "sub_1")
      assert.deepEqual(params, { expand: ["latest_invoice"] })
      return current
    } } } as unknown as Stripe
  }

  test("uses verified price not selectedTier, including incomplete metadata and expanded subscription ID", async () => {
    for (const metadata of [{ selectedTier: "business_pro", userId: "tenant_1" }, {}, { selectedTier: "not_a_plan" }]) {
      const result = await resolveCheckoutCompletion(client(subscription()), session({ metadata }), binding)
      assert.equal(result?.tier, "business_control")
      assert.equal(result?.trialEndsAt?.getTime(), 2000000)
      assert.equal(result?.periodEnd?.getTime(), 4000000)
    }
  })

  test("rejects conflicting session/customer/user/subscription and unknown current price", async () => {
    for (const overrides of [{ customer: "cus_other" }, { metadata: { userId: "other" } }]) {
      await assert.rejects(resolveCheckoutCompletion(client(subscription()), session(overrides), binding), /conflicting_stripe/)
    }
    await assert.rejects(resolveCheckoutCompletion(client(subscription({ id: "sub_other" })), session(), binding), /conflicting_stripe_subscription/)
    await assert.rejects(resolveCheckoutCompletion(client(subscription({ items: { data: [{ price: { id: "unknown" } }] } })), session(), binding), /unknown_or_ambiguous_stripe_price/)
    assert.equal(await resolveCheckoutCompletion(client(subscription()), session(), { ...binding, stripeSubscriptionId: "sub_new" }), null)
    assert.equal(await resolveCheckoutCompletion(client(subscription()), session({ subscription: null }), binding), null)
  })
})