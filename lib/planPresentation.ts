import {
  hasPlanFeature,
  PLAN_CATALOG,
  PLAN_ORDER,
  type SubscriptionFeature,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"
import { canAccessMarginGuard } from "@/lib/dashboard/marginguardAccess"
import { canAccessOwnersDigest } from "@/lib/dashboard/ownersDigestAccess"
import { canAccessRunwayGuard } from "@/lib/dashboard/runwayGuardAccess"
import { canAccessTaxBuffer } from "@/lib/dashboard/taxBufferAccess"

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
  essentials: "Essentials: Start controlling invoices and cash risks.",
  business_control: "Business Control: Complete financial visibility for owner-operated businesses.",
  small_business: "Small Business: Automation and collaboration for growing teams.",
  business_pro: "Business Pro: Advanced forecasting, governance and multi-entity control.",
  accountant_partner: "For bookkeepers and accountants managing invoice follow-ups across multiple clients.",
}

export function getPlanModuleCoverage(tier: SubscriptionTier): string[] {
  const coverage = ["InvoiceGuard receivables control"]

  if (hasPlanFeature(tier, "commitguard_core")) {
    coverage.push("CommitGuard committed-cash visibility")
  }

  if (canAccessTaxBuffer(tier)) {
    coverage.push("Tax Buffer reserve planning")
  }

  if (canAccessOwnersDigest(tier)) {
    coverage.push("Owner's Digest executive summary")
  }

  if (canAccessMarginGuard(tier)) {
    coverage.push("MarginGuard profitability monitoring")
  }

  if (canAccessRunwayGuard(tier)) {
    coverage.push("RunwayGuard runway visibility")
  }

  return coverage
}

/** Ordered, catalog-derived highlight bullets for a tier's plan card. */
export function planHighlights(tier: SubscriptionTier): string[] {
  const plan = PLAN_CATALOG[tier]
  const allowanceLabel =
    plan.limits.chasedInvoicesPerMonth === -1
      ? "Unlimited chased invoices per month"
      : `Up to ${plan.limits.chasedInvoicesPerMonth} chased invoices per month`

  switch (tier) {
    case "essentials":
      return [
        "InvoiceGuard receivables control",
        "SpendLeak spend monitoring",
        "CommitGuard committed-cash visibility",
        "Tax Buffer reserve planning",
        allowanceLabel,
      ]
    case "business_control":
      return [
        "Everything in Essentials",
        "SpendLeak spend monitoring",
        "Owner's Digest summary and history",
        "MarginGuard and RunwayGuard core views",
        allowanceLabel,
      ]
    case "small_business":
      return [
        "Full public financial control suite",
        "SpendLeak spend monitoring",
        "Advanced alerts, exports, and verified sender domain",
        "Owner's Digest email delivery",
        allowanceLabel,
      ]
    case "business_pro":
      return [
        "Higher limits for growing teams",
        "SpendLeak spend monitoring",
        "Advanced MarginGuard and RunwayGuard scenarios",
        "More connected sources and more tracked commitments",
        allowanceLabel,
      ]
    default:
      return [allowanceLabel]
  }
}
