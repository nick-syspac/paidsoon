import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  PLAN_CATALOG,
  getPlanByTier,
  getPublicPlanSelectionIntent,
  getPublicPlans,
  hasPlanFeature,
  isFeatureImplemented,
  normalizeSubscriptionTier,
  resolvePlanSelectorTier,
  UNIMPLEMENTED_FEATURES,
} from "@/lib/subscriptionPlans"
import { planHighlights } from "@/lib/planPresentation"

test("plan catalog includes Essentials, Solo, Small Business, Business Pro, and Accountant Partner pricing", () => {
  assert.equal(PLAN_CATALOG.starter.monthlyPriceAud, 15)
  assert.equal(PLAN_CATALOG.solo.monthlyPriceAud, 29)
  assert.equal(PLAN_CATALOG.small_business.monthlyPriceAud, 69)
  assert.equal(PLAN_CATALOG.business_pro.monthlyPriceAud, 149)
  assert.equal(PLAN_CATALOG.accountant_partner.monthlyPriceAud, null)
})

test("invoice allowances are tier-specific", () => {
  assert.equal(getPlanByTier("starter").limits.chasedInvoicesPerMonth, 10)
  assert.equal(getPlanByTier("solo").limits.chasedInvoicesPerMonth, 50)
  assert.equal(getPlanByTier("small_business").limits.chasedInvoicesPerMonth, 250)
  assert.equal(getPlanByTier("business_pro").limits.chasedInvoicesPerMonth, 1000)
  assert.equal(getPlanByTier("accountant_partner").limits.chasedInvoicesPerMonth, -1)
})

test("seat limits are tier-specific", () => {
  assert.equal(getPlanByTier("starter").limits.userSeats, 1)
  assert.equal(getPlanByTier("solo").limits.userSeats, 1)
  assert.equal(getPlanByTier("small_business").limits.userSeats, 3)
  assert.equal(getPlanByTier("business_pro").limits.userSeats, 10)
  assert.equal(getPlanByTier("accountant_partner").limits.userSeats, -1)
})

test("customer-selectable limits reflect the launch package, with Business Pro supporting multiple entities", () => {
  assert.equal(getPlanByTier("starter").limits.connectedInvoiceSources, 1)
  assert.equal(getPlanByTier("solo").limits.connectedInvoiceSources, 1)
  assert.equal(getPlanByTier("small_business").limits.connectedInvoiceSources, 1)
  assert.equal(getPlanByTier("business_pro").limits.connectedInvoiceSources, 3)
  assert.equal(getPlanByTier("accountant_partner").limits.connectedInvoiceSources, -1)
})

test("there is no legacy tier aliasing — unrecognised values fall back to the default", () => {
  assert.equal(normalizeSubscriptionTier("free"), DEFAULT_SUBSCRIPTION_TIER)
  assert.equal(normalizeSubscriptionTier("pro"), DEFAULT_SUBSCRIPTION_TIER)
  assert.equal(normalizeSubscriptionTier("business"), DEFAULT_SUBSCRIPTION_TIER)
  assert.equal(normalizeSubscriptionTier("unknown_tier"), DEFAULT_SUBSCRIPTION_TIER)
  assert.equal(normalizeSubscriptionTier("__proto__"), DEFAULT_SUBSCRIPTION_TIER)
  assert.equal(normalizeSubscriptionTier("constructor"), DEFAULT_SUBSCRIPTION_TIER)
  assert.equal(normalizeSubscriptionTier("toString"), DEFAULT_SUBSCRIPTION_TIER)
  assert.equal(normalizeSubscriptionTier(null), DEFAULT_SUBSCRIPTION_TIER)
})

test("solo, small_business, and business_pro are first-class tiers, not aliases", () => {
  assert.equal(normalizeSubscriptionTier("solo"), "solo")
  assert.equal(normalizeSubscriptionTier("small_business"), "small_business")
  assert.equal(normalizeSubscriptionTier("business_pro"), "business_pro")
})

test("sender-identity ladder is gated by tier", () => {
  assert.equal(hasPlanFeature("starter", "custom_reply_to"), false)
  assert.equal(hasPlanFeature("starter", "custom_sender_name"), false)
  assert.equal(hasPlanFeature("starter", "verified_from_domain"), false)

  assert.equal(hasPlanFeature("solo", "custom_reply_to"), true)
  assert.equal(hasPlanFeature("solo", "custom_sender_name"), true)
  assert.equal(hasPlanFeature("solo", "verified_from_domain"), false)

  assert.equal(hasPlanFeature("small_business", "custom_sender_name"), true)
  assert.equal(hasPlanFeature("small_business", "verified_from_domain"), true)
  assert.equal(hasPlanFeature("business_pro", "custom_sender_name"), true)
  assert.equal(hasPlanFeature("business_pro", "verified_from_domain"), true)
})

test("ai_rewrite and tone_settings are gated at Solo and above", () => {
  assert.equal(hasPlanFeature("starter", "ai_rewrite"), false)
  assert.equal(hasPlanFeature("starter", "tone_settings"), false)
  assert.equal(hasPlanFeature("solo", "ai_rewrite"), true)
  assert.equal(hasPlanFeature("solo", "tone_settings"), true)
  assert.equal(hasPlanFeature("small_business", "ai_rewrite"), true)
  assert.equal(hasPlanFeature("business_pro", "ai_rewrite"), true)
  assert.equal(hasPlanFeature("accountant_partner", "ai_rewrite"), true)
})

test("core follow-up capabilities are available on every paid tier", () => {
  for (const tier of ["starter", "solo", "small_business", "business_pro"] as const) {
    assert.equal(hasPlanFeature(tier, "accounting_integrations"), true, `${tier} accounting_integrations`)
    assert.equal(hasPlanFeature(tier, "promise_to_pay_tracking"), true, `${tier} promise_to_pay_tracking`)
    assert.equal(hasPlanFeature(tier, "dispute_pause"), true, `${tier} dispute_pause`)
    assert.equal(hasPlanFeature(tier, "overdue_invoice_dashboard"), true, `${tier} overdue_invoice_dashboard`)
    assert.equal(hasPlanFeature(tier, "payment_status_dashboard"), true, `${tier} payment_status_dashboard`)
  }
  assert.equal(hasPlanFeature("starter", "weekly_summary_email"), false)
  assert.equal(hasPlanFeature("solo", "weekly_summary_email"), false)
  assert.equal(hasPlanFeature("small_business", "weekly_summary_email"), true)
  assert.equal(hasPlanFeature("business_pro", "weekly_summary_email"), true)
  assert.equal(hasPlanFeature("accountant_partner", "weekly_summary_email"), true)
})

test("getPublicPlans excludes the contact-only Accountant Partner tier and follows the revised public order", () => {
  const publicPlans = getPublicPlans()
  assert.deepEqual(
    publicPlans.map((plan) => plan.id),
    ["starter", "solo", "small_business", "business_pro"],
  )
  assert.ok(publicPlans.every((plan) => plan.visibility === "public"))
})

test("plan selector defaults to the current tier without selection intent", () => {
  const preselectedTier = getPublicPlanSelectionIntent(undefined)

  assert.equal(resolvePlanSelectorTier("solo", preselectedTier), "solo")
})

test("plan selector accepts valid public-plan selection intent", () => {
  const preselectedTier = getPublicPlanSelectionIntent("small_business")

  assert.equal(resolvePlanSelectorTier("solo", preselectedTier), "small_business")
})

test("plan selector ignores invalid and contact-only selection intent", () => {
  assert.equal(
    resolvePlanSelectorTier("solo", getPublicPlanSelectionIntent("unknown_tier")),
    "solo",
  )
  assert.equal(resolvePlanSelectorTier("solo", getPublicPlanSelectionIntent("__proto__")), "solo")
  assert.equal(resolvePlanSelectorTier("solo", getPublicPlanSelectionIntent("constructor")), "solo")
  assert.equal(resolvePlanSelectorTier("solo", getPublicPlanSelectionIntent("toString")), "solo")
  assert.equal(
    resolvePlanSelectorTier("solo", getPublicPlanSelectionIntent("accountant_partner")),
    "solo",
  )
})

test("explicit plan selector choice overrides query intent and current tier", () => {
  assert.equal(resolvePlanSelectorTier("solo", "small_business", "starter"), "starter")
})

test("Small Business is marked as the popular plan in the public pricing story", () => {
  assert.equal(PLAN_CATALOG.small_business.popular, true)
  assert.ok(!PLAN_CATALOG.solo.popular)
  assert.ok(!PLAN_CATALOG.starter.popular)
})

test("Essentials includes SpendLeak, while CostGuard and CashPlan stay behind Solo", () => {
  const essentialsHighlights = planHighlights("starter").join(" ")
  const soloHighlights = planHighlights("solo").join(" ")
  const smallBusinessHighlights = planHighlights("small_business").join(" ")
  const businessProHighlights = planHighlights("business_pro").join(" ")

  assert.match(essentialsHighlights, /SpendLeak/i)
  assert.doesNotMatch(essentialsHighlights, /CostGuard|CashPlan/i)
  assert.match(soloHighlights, /SpendLeak|CostGuard|CashPlan/i)
  assert.match(smallBusinessHighlights, /SpendLeak|CostGuard|CashPlan/i)
  assert.match(businessProHighlights, /SpendLeak|CostGuard|CashPlan/i)
})

test("features marked as not-yet-implemented are disabled on every tier", () => {
  for (const feature of UNIMPLEMENTED_FEATURES) {
    assert.equal(isFeatureImplemented(feature), false, `${feature} should be marked unimplemented`)
  }
  assert.equal(isFeatureImplemented("basic_email_reminders"), true)
})