import { hasPlanFeature } from "@/lib/subscriptionPlans"

export function canAccessOwnersDigest(tier: string | null | undefined): boolean {
  return hasPlanFeature(tier, "owners_digest_core")
}
