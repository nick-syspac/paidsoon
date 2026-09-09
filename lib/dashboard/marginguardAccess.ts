import { hasPlanFeature } from "@/lib/subscriptionPlans"

export function canAccessMarginGuard(tier: string | null | undefined): boolean {
  return hasPlanFeature(tier, "marginguard_core")
}
