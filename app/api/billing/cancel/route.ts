import { createClient } from "@/lib/supabase/server"
import {
  createSubscriptionCancellationPortalSession,
  listCustomerSubscriptions,
  retrieveSubscriptionWithLatestInvoice,
} from "@/lib/billing/stripeSubscriptions"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import Stripe from "stripe"
import { DEFAULT_SUBSCRIPTION_TIER } from "@/lib/subscriptionPlans"

const CANCELABLE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
  "unpaid",
])

type BillingProfile = {
  userId: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  subscriptionCurrentPeriodEnd: Date | null
}

async function retrieveSubscriptionWithPeriodEnd(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription | null> {
  try {
    return await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
  } catch {
    return null
  }
}

async function resolveCancelableSubscription(
  stripe: Stripe,
  profile: BillingProfile,
): Promise<Stripe.Subscription | null> {
  if (profile.stripeSubscriptionId) {
    const subscription = await retrieveSubscriptionWithPeriodEnd(stripe, profile.stripeSubscriptionId)
    if (subscription && CANCELABLE_STATUSES.has(subscription.status)) {
      return subscription
    }
  }

  if (!profile.stripeCustomerId) {
    return null
  }

  const subscriptions = await listCustomerSubscriptions(stripe, profile.stripeCustomerId)
  const activeSubscription = subscriptions.data.find((subscription) =>
    CANCELABLE_STATUSES.has(subscription.status),
  )

  if (!activeSubscription) {
    return null
  }

  return retrieveSubscriptionWithPeriodEnd(stripe, activeSubscription.id)
}

function resolvePeriodEndDate(
  subscription: Stripe.Subscription,
  fallback: Date | null,
): Date | null {
  const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
  if (latestInvoice?.period_end) {
    return new Date(latestInvoice.period_end * 1000)
  }
  return fallback
}

export async function POST() {
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

  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({
      where: { userId: user.id },
      select: {
        userId: true,
        subscriptionStatus: true,
        subscriptionTier: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionCurrentPeriodEnd: true,
      },
    }),
  )

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 })
  }

  const isTrialOnly = profile.subscriptionStatus === "trialing" && !profile.stripeSubscriptionId

  if (isTrialOnly) {
    await withUserContext(user.id, (tx) =>
      tx.userProfile.update({
        where: { userId: user.id },
        data: {
          subscriptionStatus: "cancelled",
          subscriptionTier: DEFAULT_SUBSCRIPTION_TIER,
          trialEndsAt: null,
          subscriptionCancelAt: null,
          pendingDowngradeTier: null,
          stripeScheduleId: null,
        },
      }),
    )

    return NextResponse.json({
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription?cancellation=ended`,
    })
  }

  if (!profile.stripeCustomerId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 })
  }

  try {
    const subscription = await resolveCancelableSubscription(stripe, profile)

    if (!subscription) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 400 })
    }

    if (profile.stripeSubscriptionId !== subscription.id) {
      await withUserContext(user.id, (tx) =>
        tx.userProfile.update({
          where: { userId: user.id },
          data: { stripeSubscriptionId: subscription.id },
        }),
      )
    }

    const periodEnd = resolvePeriodEndDate(subscription, profile.subscriptionCurrentPeriodEnd)
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription`
    const successUrl = new URL(returnUrl)
    successUrl.searchParams.set("cancellation", "scheduled")
    if (periodEnd) {
      successUrl.searchParams.set("cancelAt", periodEnd.toISOString())
    }

    const session = await createSubscriptionCancellationPortalSession(stripe, {
      customer: profile.stripeCustomerId,
      return_url: returnUrl,
      flow_data: {
        type: "subscription_cancel",
        subscription_cancel: {
          subscription: subscription.id,
        },
        after_completion: {
          type: "redirect",
          redirect: {
            return_url: successUrl.toString(),
          },
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("[POST /api/billing/cancel] Failed to create cancellation flow", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}