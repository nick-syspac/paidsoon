import { createClient } from "@/lib/supabase/server"
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
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID ?? process.env.STRIPE_SMALL_BUSINESS_PRICE_ID,
  accountant_partner: undefined,  // contact-us pricing; not via Stripe Checkout
}

export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
  })
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

  // Existing subscriber: use subscriptions.update instead of Checkout
  if (profile.stripeSubscriptionId && customerId) {
    const currentTierIndex = PLAN_ORDER.indexOf(normalizeSubscriptionTier(profile.subscriptionTier))
    const requestedTierIndex = PLAN_ORDER.indexOf(requestedTier)

    if (requestedTierIndex < currentTierIndex) {
      // Downgrade — must use the dedicated downgrade endpoint
      return NextResponse.json(
        { error: "Use the downgrade endpoint for plan downgrades" },
        { status: 400 },
      )
    }

    // Upgrade — apply immediately with proration
    await stripe.subscriptions.update(profile.stripeSubscriptionId, {
      items: [{ price: priceId }],
      proration_behavior: "create_prorations",
    })
    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription?success=upgraded&tier=${requestedTier}`
    return NextResponse.json({ url: successUrl })
  }

  // New subscriber — create Stripe Checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription?success=upgraded&tier=${requestedTier}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription?cancelled=true`,
    metadata: { userId: user.id, selectedTier: requestedTier },
  })

  return NextResponse.json({ url: session.url })
}
