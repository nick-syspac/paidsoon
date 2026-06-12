import { withUserContext } from "@/lib/db/withUserContext"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  getPlanByTier,
  hasPlanFeature,
  normalizeSubscriptionTier,
  type SubscriptionFeature,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"

export async function getSubscriptionTier(
  userId: string,
): Promise<SubscriptionTier> {
  const profile = await withUserContext(userId, (tx) =>
    tx.userProfile.findUnique({
      where: { userId },
      select: { subscriptionTier: true },
    }),
  )

  return normalizeSubscriptionTier(profile?.subscriptionTier)
}

export async function requireFeature(
  userId: string,
  feature: SubscriptionFeature,
): Promise<boolean> {
  const tier = await getSubscriptionTier(userId)
  return hasPlanFeature(tier, feature)
}

// Backward-compatible helper retained for existing callers.
export async function requirePro(userId: string): Promise<boolean> {
  return requireFeature(userId, "own_email_address")
}

export function getInvoiceLimitForTier(tier?: string | null): number {
  return getPlanByTier(tier).limits.chasedInvoicesPerMonth
}

export function getStripeConnectionLimitForTier(tier?: string | null): number {
  return getPlanByTier(tier).limits.connectedStripeAccounts
}

export function getUserSeatLimitForTier(tier?: string | null): number {
  return getPlanByTier(tier).limits.userSeats
}

export const DEFAULT_INVOICE_LIMIT =
  getPlanByTier(DEFAULT_SUBSCRIPTION_TIER).limits.chasedInvoicesPerMonth
