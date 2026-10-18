import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { PLAN_ORDER, type SubscriptionTier } from "@/lib/subscriptionPlans"

/** Catalog defaults are presentation conveniences, never page authorization. */
export function getDashboardEffectiveTier(
  profile: { effectiveAccess?: EffectiveAccess } | null | undefined,
): SubscriptionTier | null {
  const access = profile?.effectiveAccess
  const tier = access?.effectiveTier
  return access?.allowAccess && tier && PLAN_ORDER.includes(tier) ? tier : null
}