/**
 * GET /api/billing/checkout/success
 *
 * Stripe Checkout's success_url target for new subscriptions. Retrieves the
 * completed session directly from Stripe and reconciles the UserProfile
 * immediately, instead of relying solely on the async
 * checkout.session.completed webhook (app/api/webhooks/stripe-billing).
 *
 * Why this exists: webhook delivery can lag by several seconds, or never
 * arrive at all if the endpoint isn't registered for a given environment.
 * The dashboard's trial-expired gate (app/dashboard/layout.tsx) re-checks
 * subscription state on every request under /dashboard/**. Without this
 * reconciliation, a user redirected straight back to
 * /dashboard/settings/subscription after paying could land there before the
 * webhook updates the profile, get bounced by the still-stale trial-expired
 * gate back to /billing/checkout, and appear stuck in a loop immediately
 * after successfully subscribing.
 *
 * The webhook remains the source of truth for ongoing lifecycle events
 * (renewals, cancellations) — this route only handles the one-time
 * post-checkout snapshot and is a safe no-op if the webhook already applied
 * the same update.
 */
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { resolveCheckoutCompletion } from "@/lib/billing"
import { normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { NextResponse } from "next/server"
import Stripe from "stripe"

export const maxDuration = 30

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("session_id")
  const fallbackTier = normalizeSubscriptionTier(searchParams.get("tier"))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/sign-in`)
  }

  const successUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription?success=upgraded&tier=${fallbackTier}`

  if (!sessionId) {
    // No session to reconcile (e.g. direct navigation) — the webhook is
    // still the primary path for this case.
    return NextResponse.redirect(successUrl)
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-05-27.dahlia",
    })
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // Ownership check: only reconcile using a session created for this
    // exact user (metadata.userId is set at session creation in
    // app/api/billing/checkout/route.ts). Prevents a session_id belonging
    // to another user from being used to alter this user's profile.
    if (session.metadata?.userId !== user.id) {
      return NextResponse.redirect(successUrl)
    }

    if (session.payment_status === "paid") {
      const completion = await resolveCheckoutCompletion(stripe, session)
      if (completion) {
        await withUserContext(user.id, (tx) =>
          tx.userProfile.update({
            where: { userId: user.id },
            data: {
              subscriptionTier: completion.tier,
              subscriptionStatus: "active",
              trialEndsAt: null,
              stripeCustomerId: completion.customerId,
              stripeSubscriptionId: completion.subscriptionId,
              subscriptionCurrentPeriodEnd: completion.periodEnd,
            },
          }),
        )
      }
    }
  } catch (err) {
    // Best-effort fallback — the webhook is still the source of truth.
    // Don't block the redirect on a Stripe API hiccup.
    console.error("[billing/checkout/success] reconciliation failed", err)
  }

  return NextResponse.redirect(successUrl)
}
