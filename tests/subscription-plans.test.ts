import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  PLAN_CATALOG,
  getPlanByTier,
  hasPlanFeature,
  normalizeSubscriptionTier,
} from "@/lib/subscriptionPlans"

test("plan catalog includes Starter, Business, and Accountant Partner pricing", () => {
  assert.equal(PLAN_CATALOG.starter.monthlyPriceAud, 19)
  assert.equal(PLAN_CATALOG.business.monthlyPriceAud, 49)
  assert.equal(PLAN_CATALOG.accountant_partner.monthlyPriceAud, null)
})

test("invoice limits are tier-specific", () => {
  assert.equal(getPlanByTier("starter").limits.chasedInvoicesPerMonth, 20)
  assert.equal(getPlanByTier("business").limits.chasedInvoicesPerMonth, 100)
  assert.equal(getPlanByTier("accountant_partner").limits.chasedInvoicesPerMonth, -1)
})

test("legacy tiers normalize safely", () => {
  assert.equal(normalizeSubscriptionTier("free"), "starter")
  assert.equal(normalizeSubscriptionTier("pro"), "starter")
  assert.equal(normalizeSubscriptionTier("solo"), "starter")
  assert.equal(normalizeSubscriptionTier("small_business"), "business")
  assert.equal(normalizeSubscriptionTier("unknown_tier"), DEFAULT_SUBSCRIPTION_TIER)
})

test("feature access matches tier expectations", () => {
  assert.equal(hasPlanFeature("starter", "own_email_address"), false)
  assert.equal(hasPlanFeature("business", "own_email_address"), true)
  assert.equal(hasPlanFeature("business", "ai_rewrite"), true)
  assert.equal(hasPlanFeature("starter", "ai_rewrite"), false)
})

test("accounting_integrations feature is gated at Business+ tier", () => {
  assert.equal(hasPlanFeature("starter", "accounting_integrations"), false)
  assert.equal(hasPlanFeature("free", "accounting_integrations"), false) // legacy alias
  assert.equal(hasPlanFeature("business", "accounting_integrations"), true)
  assert.equal(hasPlanFeature("accountant_partner", "accounting_integrations"), true)
  assert.equal(hasPlanFeature("small_business", "accounting_integrations"), true) // legacy alias → business
})