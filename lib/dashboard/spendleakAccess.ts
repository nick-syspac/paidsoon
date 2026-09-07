import { normalizeSubscriptionTier, type SubscriptionTier } from "@/lib/subscriptionPlans"

const SPENDLEAK_ENABLED_TIERS: ReadonlySet<SubscriptionTier> = new Set([
  "small_business",
  "accountant_partner",
])

export function canAccessSpendLeak(tier: string | null | undefined): boolean {
  return SPENDLEAK_ENABLED_TIERS.has(normalizeSubscriptionTier(tier))
}
