import { prismaAdmin as prisma } from "@/lib/db/admin"
import { getInvoiceLimitForTier } from "@/lib/billing"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  normalizeSubscriptionTier,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"
import { NextResponse } from "next/server"
import Stripe from "stripe"

const PRICE_ID_TO_TIER: Record<string, SubscriptionTier> = {
  ...(process.env.STRIPE_STARTER_PRICE_ID
    ? { [process.env.STRIPE_STARTER_PRICE_ID]: "starter" as const }
    : {}),
  ...(process.env.STRIPE_SOLO_PRICE_ID
    ? { [process.env.STRIPE_SOLO_PRICE_ID]: "solo" as const }
    : {}),
  ...(process.env.STRIPE_PRO_PRICE_ID
    ? { [process.env.STRIPE_PRO_PRICE_ID]: "solo" as const }
    : {}),
  ...(process.env.STRIPE_SMALL_BUSINESS_PRICE_ID
    ? { [process.env.STRIPE_SMALL_BUSINESS_PRICE_ID]: "small_business" as const }
    : {}),
}

function resolveTierFromSubscription(
  subscription: Stripe.Subscription,
  fallbackTier?: string | null,
): SubscriptionTier {
  const priceId = subscription.items.data[0]?.price?.id
  if (priceId && PRICE_ID_TO_TIER[priceId]) {
    return PRICE_ID_TO_TIER[priceId]
  }
  return normalizeSubscriptionTier(fallbackTier)
}

// Must use raw body for Stripe signature verification
export async function POST(request: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-05-27.dahlia",
  })
  const payload = await request.text()
  const signature = request.headers.get("stripe-signature") ?? ""

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_BILLING_WEBHOOK_SECRET!
    )
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      if (userId && session.subscription) {
        const checkoutTier = normalizeSubscriptionTier(session.metadata?.selectedTier)
        await prisma.userProfile.update({
          where: { userId },
          data: {
            subscriptionTier: checkoutTier,
            subscriptionStatus: "active",
            stripeCustomerId: session.customer as string,
          },
        })
      }
      break
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription
      const profile = await prisma.userProfile.findFirst({
        where: { stripeCustomerId: subscription.customer as string },
      })
      if (profile) {
        const tier: SubscriptionTier =
          subscription.status === "active" || subscription.status === "trialing"
            ? resolveTierFromSubscription(subscription, profile.subscriptionTier)
            : DEFAULT_SUBSCRIPTION_TIER
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: {
            subscriptionTier: tier,
            subscriptionStatus: subscription.status,
          },
        })
      }
      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription
      const profile = await prisma.userProfile.findFirst({
        where: { stripeCustomerId: subscription.customer as string },
      })
      if (profile) {
        // Revert to starter tier
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: {
            subscriptionTier: DEFAULT_SUBSCRIPTION_TIER,
            subscriptionStatus: "cancelled",
          },
        })

        // Pause invoices over starter limit.
        const starterLimit = getInvoiceLimitForTier(DEFAULT_SUBSCRIPTION_TIER)
        const activeInvoices = await prisma.trackedInvoice.findMany({
          where: {
            userId: profile.userId,
            status: { in: ["pending", "snoozed"] },
          },
          orderBy: { nextEmailAt: "asc" },
        })

        const toKeep = activeInvoices.slice(0, starterLimit).map((i: { id: string }) => i.id)
        const toPause = activeInvoices
          .slice(starterLimit)
          .map((i: { id: string }) => i.id)

        if (toPause.length > 0) {
          await prisma.trackedInvoice.updateMany({
            where: { id: { in: toPause } },
            data: { status: "paused" },
          })
        }
        void toKeep // suppress unused warning
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
