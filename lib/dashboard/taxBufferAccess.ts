import { hasPlanFeature } from "@/lib/subscriptionPlans"

export function canAccessTaxBuffer(tier: string | null | undefined): boolean {
  return hasPlanFeature(tier, "tax_buffer_basic")
}
