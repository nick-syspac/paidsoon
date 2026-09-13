import { createClient } from "@/lib/supabase/server"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { withUserContext } from "@/lib/db/withUserContext"
import { createUserProfile } from "@/lib/actions/auth"
import { normalizeSubscriptionTier, PLAN_ORDER, type SubscriptionTier } from "@/lib/subscriptionPlans"
import { NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

const bodySchema = z
  .object({
    tier: z.string().optional(),
  })
  .optional()

const PRICE_ID_BY_TIER: Record<SubscriptionTier, string | undefined> = {
  essentials: process.env.STRIPE_STARTER_PRICE_ID,
  business_control: process.env.STRIPE_SOLO_PRICE_ID,
  small_business: process.env.STRIPE_SMALL_BUSINESS_PRICE_ID,
  business_pro: process.env.STRIPE_BUSINESS_PRO_PRICE_ID,
  accountant_partner: undefined,  // contact-us pricing; not via Stripe Checkout
}

const TRIAL_ELIGIBLE_TIERS = new Set<SubscriptionTier>([
  "essentials",
  "business_control",
  "small_business",
  "business_pro",
])

const DUPLICATE_BLOCKING_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
])

const UPDATE_ELIGIBLE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
])

export async function POST(request: Request) {
  const stripe = createStripeClient()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({ where: { userId: user.id } }),
  )

  if (!profile) {
    // Profile missing — bootstrap it now (idempotent upsert) and re-fetch.
    await createUserProfile(user.id)
    profile = await withUserContext(user.id, (tx) =>
      tx.userProfile.findUnique({ where: { userId: user.id } }),
    )
  }

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  let requestBody: unknown = {}
  try {
    requestBody = await request.json()
  } catch {
    // Allow legacy callers with no body.
  }

  const parsed = bodySchema.safeParse(requestBody)
  const requestedTier = normalizeSubscriptionTier(
    parsed.success ? parsed.data?.tier : undefined,
  )
  const priceId = PRICE_ID_BY_TIER[requestedTier]

  if (!priceId) {
    return NextResponse.json(
      { error: `Price ID not configured for tier: ${requestedTier}` },
      { status: 500 },
    )
  }

  // Get or create Stripe customer
  let customerId = profile.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    await withUserContext(user.id, (tx) =>
      tx.userProfile.update({
        where: { userId: user.id },
        data: { stripeCustomerId: customerId },
      }),
    )
  }

  let existingSubscriptionId: string | null = null
  let existingSubscriptionStatus: Stripe.Subscription.Status | null = null

  if (profile.stripeSubscriptionId) {
    const existing = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId).catch(() => null)
    if (existing && UPDATE_ELIGIBLE_STATUSES.has(existing.status)) {
      existingSubscriptionId = existing.id
      existingSubscriptionStatus = existing.status
    }
  }

  if (!existingSubscriptionId && customerId) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    })
    const candidate = subscriptions.data.find((subscription) =>
      UPDATE_ELIGIBLE_STATUSES.has(subscription.status),
    )
    if (candidate) {
      existingSubscriptionId = candidate.id
      existingSubscriptionStatus = candidate.status
      await withUserContext(user.id, (tx) =>
        tx.userProfile.update({
          where: { userId: user.id },
          data: { stripeSubscriptionId: candidate.id },
        }),
      )
    }
  }

  // Existing subscriber: use subscriptions.update instead of Checkout
  if (existingSubscriptionId && customerId) {
    const currentTierIndex = PLAN_ORDER.indexOf(normalizeSubscriptionTier(profile.subscriptionTier))
    const requestedTierIndex = PLAN_ORDER.indexOf(requestedTier)

    if (requestedTierIndex < currentTierIndex) {
      // Downgrade — must use the dedicated downgrade endpoint
      return NextResponse.json(
        { error: "Use the downgrade endpoint for plan downgrades" },
        { status: 400 },
      )
    }

    if (
      existingSubscriptionStatus &&
      DUPLICATE_BLOCKING_STATUSES.has(existingSubscriptionStatus) &&
      requestedTierIndex === currentTierIndex
    ) {
      return NextResponse.json(
        { error: "Subscription already active for this plan" },
        { status: 409 },
      )
    }

    // Upgrade — apply immediately with proration
    await stripe.subscriptions.update(existingSubscriptionId, {
      items: [{ price: priceId }],
      proration_behavior: "create_prorations",
    })
    // Update the profile synchronously rather than waiting on the async
    // customer.subscription.updated webhook — this request already confirmed
    // the change with Stripe, so there's no reason for the redirect target
    // (gated by the dashboard's trial-expired check) to see stale tier data.
    await withUserContext(user.id, (tx) =>
      tx.userProfile.update({
        where: { userId: user.id },
        data: {
          subscriptionTier: requestedTier,
          subscriptionStatus: "active",
          stripePriceId: priceId,
        },
      }),
    )
    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription?success=upgraded&tier=${requestedTier}`
    return NextResponse.json({ url: successUrl })
  }

  // New subscriber — create Stripe Checkout session
  const trialDays = Number(process.env.STRIPE_TRIAL_PERIOD_DAYS ?? 14)
  const shouldAttachTrial = Number.isFinite(trialDays) && trialDays > 0 && TRIAL_ELIGIBLE_TIERS.has(requestedTier)
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    ...(shouldAttachTrial
      ? {
          subscription_data: {
            trial_period_days: trialDays,
            metadata: {
              user_id: user.id,
              plan: requestedTier,
              source: "paidsoon_checkout",
            },
          },
        }
      : {}),
    // Route through the reconciliation endpoint rather than straight back to
    // the dashboard: it retrieves the confirmed session from Stripe and
    // updates the profile immediately, instead of assuming the async
    // checkout.session.completed webhook has already landed by the time the
    // browser gets redirected back (see app/api/billing/checkout/success).
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier=${requestedTier}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription?cancelled=true`,
    metadata: {
      user_id: user.id,
      userId: user.id,
      plan: requestedTier,
      selectedTier: requestedTier,
      source: "paidsoon_checkout",
    },
  })

  return NextResponse.json({ url: session.url })
}
