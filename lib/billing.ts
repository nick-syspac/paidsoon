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

/** Returns the effective invoice limit for a tier. -1 in the plan catalog means unlimited; this returns Number.MAX_SAFE_INTEGER in that case. */
export function getInvoiceLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.chasedInvoicesPerMonth
  return limit === -1 ? Number.MAX_SAFE_INTEGER : limit
}

export function getStripeConnectionLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.connectedStripeAccounts
  return limit === -1 ? Number.MAX_SAFE_INTEGER : limit
}

export function getUserSeatLimitForTier(tier?: string | null): number {
  const limit = getPlanByTier(tier).limits.userSeats
  return limit === -1 ? Number.MAX_SAFE_INTEGER : limit
}

export const DEFAULT_INVOICE_LIMIT =
  getPlanByTier(DEFAULT_SUBSCRIPTION_TIER).limits.chasedInvoicesPerMonth
