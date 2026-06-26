import { prismaAdmin as prisma } from "@/lib/db/admin"
import { getInvoiceLimitForTier } from "@/lib/billing"
import {
  DEFAULT_SUBSCRIPTION_TIER,
  PLAN_ORDER,
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
        const subscriptionId = session.subscription as string
        // Fetch subscription and expand latest_invoice to get period_end
        // (current_period_end was removed from Subscription in API 2026-05-27)
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["latest_invoice"],
        })
        const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
        const periodEnd = latestInvoice?.period_end ? new Date(latestInvoice.period_end * 1000) : null
        await prisma.userProfile.update({
          where: { userId },
          data: {
            subscriptionTier: checkoutTier,
            subscriptionStatus: "active",
            trialEndsAt: null,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscriptionId,
            subscriptionCurrentPeriodEnd: periodEnd,
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

        // Detect if a pending downgrade schedule has just executed:
        // the landed tier matches pendingDowngradeTier → clear pending fields.
        const pendingTier = normalizeSubscriptionTier(profile.pendingDowngradeTier)
        const scheduleExecuted =
          profile.pendingDowngradeTier !== null &&
          PLAN_ORDER.indexOf(tier) === PLAN_ORDER.indexOf(pendingTier)

        // Fetch latest invoice to get period_end
        // (current_period_end was removed from Subscription in API 2026-05-27)
        const subExpanded = await stripe.subscriptions.retrieve(subscription.id, {
          expand: ["latest_invoice"],
        })
        const latestInv = subExpanded.latest_invoice as Stripe.Invoice | null
        const periodEnd = latestInv?.period_end ? new Date(latestInv.period_end * 1000) : null
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: {
            subscriptionTier: tier,
            subscriptionStatus: subscription.status,
            stripeSubscriptionId: subscription.id,
            subscriptionCurrentPeriodEnd: periodEnd,
            ...(scheduleExecuted
              ? { pendingDowngradeTier: null, stripeScheduleId: null }
              : {}),
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

    case "subscription_schedule.released": {
      // Fired when a schedule is released (cancelled) — clear pending downgrade state.
      const schedule = event.data.object as Stripe.SubscriptionSchedule
      const profile = await prisma.userProfile.findFirst({
        where: { stripeScheduleId: schedule.id },
      })
      if (profile) {
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: { pendingDowngradeTier: null, stripeScheduleId: null },
        })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
