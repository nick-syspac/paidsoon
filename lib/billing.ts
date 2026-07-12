import { withUserContext } from "@/lib/db/withUserContext"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  getPlanByTier,
  hasPlanFeature,
  normalizeSubscriptionTier,
  type SubscriptionFeature,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"
import type Stripe from "stripe"

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

/**
 * Computes the tier, subscription ID, customer ID, and current period end
 * that a completed Stripe Checkout session should apply to a UserProfile.
 * Shared between the `checkout.session.completed` webhook handler
 * (app/api/webhooks/stripe-billing) and the post-checkout reconciliation
 * route (app/api/billing/checkout/success), which self-heals the immediate
 * post-payment redirect in case the webhook hasn't been delivered yet —
 * webhook delivery is async and can lag by several seconds, or never arrive
 * at all in a misconfigured/unregistered environment. The webhook remains
 * the source of truth for ongoing lifecycle events (renewals,
 * cancellations); this only covers the one-time post-checkout snapshot.
 */
export async function resolveCheckoutCompletion(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<{
  tier: SubscriptionTier
  subscriptionId: string
  customerId: string
  periodEnd: Date | null
} | null> {
  if (!session.subscription) return null

  const tier = normalizeSubscriptionTier(session.metadata?.selectedTier)
  const subscriptionId = session.subscription as string
  // Fetch subscription and expand latest_invoice to get period_end
  // (current_period_end was removed from Subscription in API 2026-05-27).
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice"],
  })
  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
  const periodEnd = latestInvoice?.period_end
    ? new Date(latestInvoice.period_end * 1000)
    : null

  return {
    tier,
    subscriptionId,
    customerId: session.customer as string,
    periodEnd,
  }
}
