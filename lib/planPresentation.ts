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
  starter: "For side hustlers and occasional invoicers who want automated invoice chasing on autopilot.",
  solo: "For full-time sole traders and freelancers who want a fully custom reminder sequence.",
  small_business: "For small businesses with an admin/accounts team managing higher invoice volume.",
  accountant_partner: "For bookkeepers and accountants managing invoice follow-ups across multiple clients.",
}

/** Ordered, catalog-derived highlight bullets for a tier's plan card. */
export function planHighlights(tier: SubscriptionTier): string[] {
  const plan = PLAN_CATALOG[tier]
  const highlights: string[] = []

  highlights.push(
    plan.limits.chasedInvoicesPerMonth === -1
      ? "Unlimited invoices chased per month"
      : `Up to ${plan.limits.chasedInvoicesPerMonth} invoices chased per month`,
  )

  if (plan.limits.userSeats > 1) {
    highlights.push(
      isFeatureImplemented("team_seats")
        ? `Up to ${plan.limits.userSeats} internal users`
        : `Up to ${plan.limits.userSeats} internal users (coming soon)`,
    )
  }

  highlights.push("Automated Friendly → Firm → Final Notice sequence")

  if (plan.features.email_reminder_sequence) {
    highlights.push("Custom reminder timing")
  }
  if (plan.features.customer_specific_sequences) {
    highlights.push(
      isFeatureImplemented("customer_specific_sequences")
        ? "Customer-specific reminder sequences"
        : "Customer-specific reminder sequences (coming soon)",
    )
  }
  if (plan.features.custom_reminder_templates) {
    highlights.push("Fully editable reminder templates")
  } else {
    highlights.push("Business name, signature & payment detail templates")
  }
  if (plan.features.verified_from_domain) {
    highlights.push("Verified custom from-address")
  } else if (plan.features.custom_sender_name) {
    highlights.push("Custom sender name & reply-to")
  } else {
    highlights.push("Custom reply-to address")
  }
  if (plan.features.ai_rewrite) {
    highlights.push("AI-assisted reminder wording")
  }
  highlights.push("Promise-to-pay tracking & dispute pause")
  highlights.push("Debtor dashboard & reminder activity history")
  if (plan.features.csv_export) {
    highlights.push(
      isFeatureImplemented("csv_export") ? "CSV export" : "CSV export (coming soon)",
    )
  }

  return highlights
}
