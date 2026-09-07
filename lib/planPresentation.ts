import {
  hasPlanFeature,
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
  starter: "A focused entry point for a growing cash-control workflow.",
  solo: "The first complete control layer for a solo operation.",
  small_business: "The recommended plan for a growing small business team.",
  business_pro: "Advanced governance, multi-entity visibility, and cash forecasting.",
  accountant_partner: "For bookkeepers and accountants managing invoice follow-ups across multiple clients.",
}

/** Ordered, catalog-derived highlight bullets for a tier's plan card. */
export function planHighlights(tier: SubscriptionTier): string[] {
  const plan = PLAN_CATALOG[tier]

  switch (tier) {
    case "starter":
      return [
        "PaidSoon core reminders",
        "SpendLeak monthly snapshot",
        "One accounting connection",
        `Up to ${plan.limits.chasedInvoicesPerMonth} chased invoices per month`,
      ]
    case "solo":
      return [
        "Full PaidSoon automation",
        "SpendLeak monitoring",
        "Basic CostGuard controls",
        "Interactive 30-day CashPlan",
        `Up to ${plan.limits.chasedInvoicesPerMonth} chased invoices per month`,
      ]
    case "small_business":
      return [
        "Full four-module platform access",
        "SpendLeak analysis and alerts",
        "CostGuard budgets and variances",
        "13-week CashPlan rolling view",
        `Up to ${plan.limits.chasedInvoicesPerMonth} chased invoices per month`,
      ]
    case "business_pro":
      return [
        "Advanced collections governance",
        "Multi-entity SpendLeak visibility",
        "CostGuard approvals and governance",
        "12-month CashPlan scenarios",
        `Up to ${plan.limits.chasedInvoicesPerMonth} chased invoices per month`,
      ]
    default:
      return [
        plan.limits.chasedInvoicesPerMonth === -1
          ? "Unlimited invoices chased per month"
          : `Up to ${plan.limits.chasedInvoicesPerMonth} invoices chased per month`,
      ]
  }
}
