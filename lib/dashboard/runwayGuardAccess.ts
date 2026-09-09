import { hasPlanFeature } from "@/lib/subscriptionPlans"

export function canAccessRunwayGuard(tier: string | null | undefined): boolean {
  return hasPlanFeature(tier, "runwayguard_core")
}
