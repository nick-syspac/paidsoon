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

test("plan catalog includes Essentials, Business Control, Small Business, Business Pro, and Accountant Partner pricing", () => {
  assert.equal(PLAN_CATALOG.essentials.name, "Essentials")
  assert.equal(PLAN_CATALOG.business_control.name, "Business Control")
  assert.equal(PLAN_CATALOG.business_control.monthlyPriceAud, 29)
  assert.equal(PLAN_CATALOG.small_business.monthlyPriceAud, 69)
  assert.equal(PLAN_CATALOG.business_pro.monthlyPriceAud, 149)
  assert.equal(PLAN_CATALOG.accountant_partner.monthlyPriceAud, null)
})

test("invoice allowances are tier-specific", () => {
  assert.equal(getPlanByTier("essentials").limits.chasedInvoicesPerMonth, 10)
  assert.equal(getPlanByTier("business_control").limits.chasedInvoicesPerMonth, 50)
  assert.equal(getPlanByTier("small_business").limits.chasedInvoicesPerMonth, 250)
  assert.equal(getPlanByTier("business_pro").limits.chasedInvoicesPerMonth, 1000)
  assert.equal(getPlanByTier("accountant_partner").limits.chasedInvoicesPerMonth, -1)
})

test("seat limits are tier-specific", () => {
  assert.equal(getPlanByTier("essentials").limits.userSeats, 1)
  assert.equal(getPlanByTier("business_control").limits.userSeats, 1)
  assert.equal(getPlanByTier("small_business").limits.userSeats, 3)
  assert.equal(getPlanByTier("business_pro").limits.userSeats, 10)
  assert.equal(getPlanByTier("accountant_partner").limits.userSeats, -1)
})

test("customer-selectable limits reflect the launch package, with Business Pro supporting multiple entities", () => {
  assert.equal(getPlanByTier("essentials").limits.connectedInvoiceSources, 1)
  assert.equal(getPlanByTier("business_control").limits.connectedInvoiceSources, 1)
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

test("business_control, small_business, and business_pro are first-class tiers, not aliases", () => {
  assert.equal(normalizeSubscriptionTier("business_control"), "business_control")
  assert.equal(normalizeSubscriptionTier("small_business"), "small_business")
  assert.equal(normalizeSubscriptionTier("business_pro"), "business_pro")
})

test("sender-identity ladder is gated by tier", () => {
  assert.equal(hasPlanFeature("essentials", "custom_reply_to"), false)
  assert.equal(hasPlanFeature("essentials", "custom_sender_name"), false)
  assert.equal(hasPlanFeature("essentials", "verified_from_domain"), false)

  assert.equal(hasPlanFeature("business_control", "custom_reply_to"), true)
  assert.equal(hasPlanFeature("business_control", "custom_sender_name"), true)
  assert.equal(hasPlanFeature("business_control", "verified_from_domain"), false)

  assert.equal(hasPlanFeature("small_business", "custom_sender_name"), true)
  assert.equal(hasPlanFeature("small_business", "verified_from_domain"), true)
  assert.equal(hasPlanFeature("business_pro", "custom_sender_name"), true)
  assert.equal(hasPlanFeature("business_pro", "verified_from_domain"), true)
})

test("ai_rewrite and tone_settings are gated at Solo and above", () => {
  assert.equal(hasPlanFeature("essentials", "ai_rewrite"), false)
  assert.equal(hasPlanFeature("essentials", "tone_settings"), false)
  assert.equal(hasPlanFeature("business_control", "ai_rewrite"), true)
  assert.equal(hasPlanFeature("business_control", "tone_settings"), true)
  assert.equal(hasPlanFeature("small_business", "ai_rewrite"), true)
  assert.equal(hasPlanFeature("business_pro", "ai_rewrite"), true)
  assert.equal(hasPlanFeature("accountant_partner", "ai_rewrite"), true)
})

test("core follow-up capabilities are available on every paid tier", () => {
  for (const tier of ["essentials", "business_control", "small_business", "business_pro"] as const) {
    assert.equal(hasPlanFeature(tier, "accounting_integrations"), true, `${tier} accounting_integrations`)
    assert.equal(hasPlanFeature(tier, "promise_to_pay_tracking"), true, `${tier} promise_to_pay_tracking`)
    assert.equal(hasPlanFeature(tier, "dispute_pause"), true, `${tier} dispute_pause`)
    assert.equal(hasPlanFeature(tier, "overdue_invoice_dashboard"), true, `${tier} overdue_invoice_dashboard`)
    assert.equal(hasPlanFeature(tier, "payment_status_dashboard"), true, `${tier} payment_status_dashboard`)
  }
  assert.equal(hasPlanFeature("essentials", "weekly_summary_email"), false)
  assert.equal(hasPlanFeature("business_control", "weekly_summary_email"), false)
  assert.equal(hasPlanFeature("small_business", "weekly_summary_email"), true)
  assert.equal(hasPlanFeature("business_pro", "weekly_summary_email"), true)
  assert.equal(hasPlanFeature("accountant_partner", "weekly_summary_email"), true)
})

test("getPublicPlans excludes the contact-only Accountant Partner tier and follows the revised public order", () => {
  const publicPlans = getPublicPlans()
  assert.deepEqual(
    publicPlans.map((plan) => plan.id),
    ["essentials", "business_control", "small_business", "business_pro"],
  )
  assert.ok(publicPlans.every((plan) => plan.visibility === "public"))
})

test("plan selector defaults to the current tier without selection intent", () => {
  const preselectedTier = getPublicPlanSelectionIntent(undefined)

  assert.equal(resolvePlanSelectorTier("business_control", preselectedTier), "business_control")
})

test("plan selector accepts valid public-plan selection intent", () => {
  const preselectedTier = getPublicPlanSelectionIntent("small_business")

  assert.equal(resolvePlanSelectorTier("business_control", preselectedTier), "small_business")
})

test("plan selector ignores invalid and contact-only selection intent", () => {
  assert.equal(
    resolvePlanSelectorTier("business_control", getPublicPlanSelectionIntent("unknown_tier")),
    "business_control",
  )
  assert.equal(resolvePlanSelectorTier("business_control", getPublicPlanSelectionIntent("__proto__")), "business_control")
  assert.equal(resolvePlanSelectorTier("business_control", getPublicPlanSelectionIntent("constructor")), "business_control")
  assert.equal(resolvePlanSelectorTier("business_control", getPublicPlanSelectionIntent("toString")), "business_control")
  assert.equal(
    resolvePlanSelectorTier("business_control", getPublicPlanSelectionIntent("accountant_partner")),
    "business_control",
  )
})

test("explicit plan selector choice overrides query intent and current tier", () => {
  assert.equal(resolvePlanSelectorTier("business_control", "small_business", "essentials"), "essentials")
})

test("Small Business remains the popular plan while business_control stays the stable internal identifier", () => {
  assert.equal(PLAN_CATALOG.business_control.id, "business_control")
  assert.equal(PLAN_CATALOG.business_control.name, "Business Control")
  assert.equal(PLAN_CATALOG.small_business.popular, true)
  assert.ok(!PLAN_CATALOG.business_control.popular)
  assert.ok(!PLAN_CATALOG.essentials.popular)
})

test("Essentials includes SpendLeak, while CostGuard and CashPlan stay behind Solo", () => {
  const essentialsHighlights = planHighlights("essentials").join(" ")
  const soloHighlights = planHighlights("business_control").join(" ")
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