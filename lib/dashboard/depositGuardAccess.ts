import { hasPlanFeature } from "@/lib/subscriptionPlans"

export function canAccessDepositGuard(tier: string | null | undefined): boolean {
  return hasPlanFeature(tier, "deposit_guard_access")
}