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
  assert.equal(PLAN_CATALOG.starter.monthlyPriceUsd, 9)
  assert.equal(PLAN_CATALOG.solo.monthlyPriceUsd, 19)
  assert.equal(PLAN_CATALOG.small_business.monthlyPriceUsd, 39)
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