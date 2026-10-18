import type Stripe from "stripe"
import type { SubscriptionTier } from "@/lib/subscriptionPlans"

export interface StripeBillingBinding {
  userId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

export interface StripeBillingIdentity {
  customer?: unknown
  metadata?: Record<string, string | undefined> | null
}

/** A projection of ONE current provider read, never a merge with delivered fields. */
export interface VerifiedStripeSnapshot {
  tier: SubscriptionTier
  subscriptionId: string
  customerId: string
  status: Stripe.Subscription.Status
  priceId: string
  periodStart: Date | null
  periodEnd: Date | null
  trialEndsAt: Date | null
  subscriptionCancelAt: Date | null
  subscriptionCancelAtPeriodEnd: boolean
}

export class StripeSnapshotError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = "StripeSnapshotError"
  }
}

export function stripeObjectId(value: unknown): string | null {
  if (value == null) return null
  const id = typeof value === "string" ? value :
    typeof value === "object" && "id" in value ? value.id : null
  if (typeof id !== "string" || !id.trim()) throw new StripeSnapshotError("invalid_stripe_id")
  return id
}

export function stripeTimestamp(seconds: number | null | undefined): Date | null {
  if (seconds == null) return null
  const milliseconds = seconds * 1000
  if (!Number.isSafeInteger(seconds) || seconds < 0 ||
      !Number.isSafeInteger(milliseconds) || milliseconds > 8.64e15) {
    throw new StripeSnapshotError("invalid_stripe_timestamp")
  }
  return new Date(milliseconds)
}

export function stripeTierForPrice(priceId: string): SubscriptionTier {
  const matches = ([
    [process.env.STRIPE_STARTER_PRICE_ID, "essentials"],
    [process.env.STRIPE_SOLO_PRICE_ID, "business_control"],
    [process.env.STRIPE_SMALL_BUSINESS_PRICE_ID, "small_business"],
    [process.env.STRIPE_BUSINESS_PRO_PRICE_ID, "business_pro"],
  ] as const).filter(([id]) => Boolean(id) && id === priceId)
  if (matches.length !== 1) throw new StripeSnapshotError("unknown_or_ambiguous_stripe_price")
  return matches[0][1]
}

function identityHints(sources: StripeBillingIdentity[]): { userId: string | null; customerId: string | null } {
  const users = new Set(sources.flatMap(({ metadata }) =>
    [metadata?.userId, metadata?.user_id].filter((id): id is string => Boolean(id))))
  const customers = new Set(sources.map(({ customer }) => stripeObjectId(customer)).filter((id) => id !== null))
  if (users.size > 1 || customers.size > 1) throw new StripeSnapshotError("conflicting_stripe_identity")
  return { userId: [...users][0] ?? null, customerId: [...customers][0] ?? null }
}

/** Discovery only. The billing coordinator revalidates identity under its tenant lock. */
export async function resolveStripeBillingProfile<T extends StripeBillingBinding>(
  lookup: {
    byUserId: (id: string) => Promise<T | null>
    byCustomerId: (id: string) => Promise<T | null>
    bySubscriptionId: (id: string) => Promise<T | null>
  },
  sources: StripeBillingIdentity[],
  subscriptionId: string | null,
): Promise<T | null> {
  const { userId, customerId } = identityHints(sources)
  const candidates = (await Promise.all([
    userId ? lookup.byUserId(userId) : null,
    customerId ? lookup.byCustomerId(customerId) : null,
    subscriptionId ? lookup.bySubscriptionId(subscriptionId) : null,
  ])).filter((profile) => profile !== null)
  const profile = candidates[0]
  if (!profile) return null
  if (candidates.some((candidate) => candidate.userId !== profile.userId) ||
      (userId && userId !== profile.userId) ||
      (customerId && profile.stripeCustomerId && customerId !== profile.stripeCustomerId)) {
    throw new StripeSnapshotError("conflicting_stripe_binding")
  }
  return profile
}

export function reconcileStripeSubscription(
  subscription: Stripe.Subscription,
  context: {
    subscriptionId: string
    sources?: StripeBillingIdentity[]
    binding?: StripeBillingBinding
    priceTier?: (priceId: string) => SubscriptionTier
  },
): { kind: "current"; snapshot: VerifiedStripeSnapshot } | { kind: "superseded" } {
  if (stripeObjectId(subscription) !== context.subscriptionId) {
    throw new StripeSnapshotError("conflicting_stripe_subscription")
  }
  const { userId, customerId } = identityHints([subscription, ...(context.sources ?? [])])
  if (!customerId || !stripeObjectId(subscription.customer)) throw new StripeSnapshotError("missing_stripe_customer")
  const binding = context.binding
  if (binding && ((userId && userId !== binding.userId) ||
      (binding.stripeCustomerId && binding.stripeCustomerId !== customerId))) {
    throw new StripeSnapshotError("conflicting_stripe_binding")
  }
  if (binding?.stripeSubscriptionId && binding.stripeSubscriptionId !== subscription.id) {
    return { kind: "superseded" }
  }
  const items = subscription.items
  if (!items || items.has_more || items.data.length !== 1) {
    throw new StripeSnapshotError("unsupported_stripe_items")
  }
  const priceId = stripeObjectId(items.data[0].price)
  if (!priceId) throw new StripeSnapshotError("missing_stripe_price")
  const tier = (context.priceTier ?? stripeTierForPrice)(priceId)
  if (!["active", "trialing", "past_due", "unpaid", "incomplete", "incomplete_expired", "canceled", "paused"].includes(subscription.status) ||
      typeof subscription.cancel_at_period_end !== "boolean") {
    throw new StripeSnapshotError("invalid_stripe_lifecycle")
  }
  const invoice = subscription.latest_invoice
  if (typeof invoice === "string") throw new StripeSnapshotError("stripe_invoice_not_expanded")
  if (invoice?.customer && stripeObjectId(invoice.customer) !== customerId) {
    throw new StripeSnapshotError("conflicting_stripe_invoice_customer")
  }
  const invoiceSubscription = stripeObjectId(invoice?.parent?.subscription_details?.subscription)
  if (invoiceSubscription && invoiceSubscription !== subscription.id) {
    throw new StripeSnapshotError("conflicting_stripe_invoice_subscription")
  }
  const periodStart = stripeTimestamp(invoice?.period_start)
  const periodEnd = stripeTimestamp(invoice?.period_end)
  if (periodStart && periodEnd && periodStart > periodEnd) throw new StripeSnapshotError("invalid_stripe_period")
  return {
    kind: "current",
    snapshot: {
      tier, subscriptionId: subscription.id, customerId, status: subscription.status, priceId,
      periodStart, periodEnd, trialEndsAt: stripeTimestamp(subscription.trial_end),
      subscriptionCancelAt: stripeTimestamp(subscription.cancel_at),
      subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  }
}

export function stripeSnapshotProfileData(snapshot: VerifiedStripeSnapshot): {
  subscriptionTier: SubscriptionTier
  subscriptionStatus: Stripe.Subscription.Status
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripePriceId: string
  subscriptionCurrentPeriodStart: Date | null
  subscriptionCurrentPeriodEnd: Date | null
  subscriptionCancelAt: Date | null
  subscriptionCancelAtPeriodEnd: boolean
  trialEndsAt: Date | null
} {
  return {
    subscriptionTier: snapshot.tier, subscriptionStatus: snapshot.status,
    stripeCustomerId: snapshot.customerId, stripeSubscriptionId: snapshot.subscriptionId,
    stripePriceId: snapshot.priceId, subscriptionCurrentPeriodStart: snapshot.periodStart,
    subscriptionCurrentPeriodEnd: snapshot.periodEnd, trialEndsAt: snapshot.trialEndsAt,
    subscriptionCancelAt: snapshot.subscriptionCancelAt,
    subscriptionCancelAtPeriodEnd: snapshot.subscriptionCancelAtPeriodEnd,
  }
}

export async function retrieveSubscriptionWithLatestInvoice(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice"],
  })
}

export async function listCustomerSubscriptions(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.ApiList<Stripe.Subscription>> {
  return stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  })
}

export async function createSubscriptionCancellationPortalSession(
  stripe: Stripe,
  params: Stripe.BillingPortal.SessionCreateParams,
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create(params)
}