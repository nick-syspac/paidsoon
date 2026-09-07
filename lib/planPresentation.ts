import {
  hasPlanFeature,
  isFeatureImplemented,
  PLAN_CATALOG,
  PLAN_ORDER,
  type SubscriptionFeature,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"

/**
 * Shared plan-presentation helpers used by the marketing pricing page and the
 * onboarding plan picker. Kept separate from `lib/subscriptionPlans.ts` (which
 * has no JSX/React dependency) but centralised here rather than duplicated in
 * each surface — duplicated prose across pages is exactly the mechanism that
 * let pricing drift out of sync with the catalog in the past.
 */

export function formatPlanPrice(monthlyPriceAud: number | null): string {
  return monthlyPriceAud === null ? "Contact us" : `$${monthlyPriceAud}/mo`
}

/** Lowest tier (by PLAN_ORDER) at which a feature is enabled, or undefined if
 * no tier has it. Used by marketing copy to name the correct tier for a
 * feature instead of hardcoding a tier name that can drift from the catalog. */
export function lowestTierWithFeature(feature: SubscriptionFeature): SubscriptionTier | undefined {
  return PLAN_ORDER.find((tier) => hasPlanFeature(tier, feature))
}

export const PLAN_TAGLINE: Record<SubscriptionTier, string> = {
  starter: "Automate day-to-day cash control.",
  solo: "Get paid and understand your cash.",
  small_business: "Give the team control over spending and cash flow.",
  business_pro: "Manage complex businesses with governance and forecasting.",
  accountant_partner: "For bookkeepers and accountants managing invoice follow-ups across multiple clients.",
}

/** Ordered, catalog-derived highlight bullets for a tier's plan card. */
export function planHighlights(tier: SubscriptionTier): string[] {
  const plan = PLAN_CATALOG[tier]

  switch (tier) {
    case "starter":
      return [
        "PaidSoon core reminders",
        "SpendLeak monthly spend snapshot",
        "Basic collection automation",
        "One accounting connection",
        `Up to ${plan.limits.chasedInvoicesPerMonth} active invoices`,
      ]
    case "solo":
      return [
        "PaidSoon reminder automation",
        "SpendLeak recurring spend monitoring",
        "CostGuard basic spend controls",
        "CashPlan 30-day cash view",
        `Up to ${plan.limits.chasedInvoicesPerMonth} active invoices`,
      ]
    case "small_business":
      return [
        "PaidSoon full collections workflow",
        "SpendLeak full spend analysis",
        "CostGuard team cost controls",
        "CashPlan 13-week planning",
        `Up to ${plan.limits.chasedInvoicesPerMonth} active invoices`,
      ]
    case "business_pro":
      return [
        "PaidSoon advanced collections controls",
        "SpendLeak multi-entity analysis",
        "CostGuard governance and approvals",
        "CashPlan 12-month scenarios",
        "Unlimited invoices",
      ]
    default:
      return [
        plan.limits.chasedInvoicesPerMonth === -1
          ? "Unlimited invoices chased per month"
          : `Up to ${plan.limits.chasedInvoicesPerMonth} invoices chased per month`,
      ]
  }
}
