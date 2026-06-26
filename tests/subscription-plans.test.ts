import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  PLAN_CATALOG,
  getPlanByTier,
  hasPlanFeature,
  normalizeSubscriptionTier,
} from "@/lib/subscriptionPlans"

test("plan catalog includes Starter, Solo, and Small Business pricing", () => {
  assert.equal(PLAN_CATALOG.starter.monthlyPriceAud, 9)
  assert.equal(PLAN_CATALOG.solo.monthlyPriceAud, 19)
  assert.equal(PLAN_CATALOG.small_business.monthlyPriceAud, 39)
})

test("invoice limits are tier-specific", () => {
  assert.equal(getPlanByTier("starter").limits.chasedInvoicesPerMonth, 10)
  assert.equal(getPlanByTier("solo").limits.chasedInvoicesPerMonth, 30)
  assert.equal(getPlanByTier("small_business").limits.chasedInvoicesPerMonth, 100)
})

test("legacy tiers normalize safely", () => {
  assert.equal(normalizeSubscriptionTier("free"), "starter")
  assert.equal(normalizeSubscriptionTier("pro"), "solo")
  assert.equal(normalizeSubscriptionTier("unknown_tier"), DEFAULT_SUBSCRIPTION_TIER)
})

test("feature access matches tier expectations", () => {
  assert.equal(hasPlanFeature("starter", "own_email_address"), false)
  assert.equal(hasPlanFeature("solo", "own_email_address"), true)
  assert.equal(hasPlanFeature("small_business", "ai_rewrite"), true)
  assert.equal(hasPlanFeature("solo", "ai_rewrite"), false)
})

test("accounting_integrations feature is gated at Solo+ tier", () => {
  assert.equal(hasPlanFeature("starter", "accounting_integrations"), false)
  assert.equal(hasPlanFeature("free", "accounting_integrations"), false) // legacy alias
  assert.equal(hasPlanFeature("solo", "accounting_integrations"), true)
  assert.equal(hasPlanFeature("pro", "accounting_integrations"), true) // legacy alias → solo
  assert.equal(hasPlanFeature("small_business", "accounting_integrations"), true)
})