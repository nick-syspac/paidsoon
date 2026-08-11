import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import {
  normalizeSubscriptionTier,
  PLAN_ORDER,
  type SubscriptionTier,
} from "@/lib/subscriptionPlans"
import { NextResponse } from "next/server"
import Stripe from "stripe"
import { z } from "zod"

const PRICE_ID_BY_TIER: Record<SubscriptionTier, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  solo: process.env.STRIPE_SOLO_PRICE_ID,
  small_business: process.env.STRIPE_SMALL_BUSINESS_PRICE_ID,
  accountant_partner: undefined,  // contact-us pricing; managed outside Stripe Billing
}

const downgradeSchema = z.object({
  tier: z.string(),
})

// ---------------------------------------------------------------------------
// POST — schedule a period-end downgrade via Stripe Subscription Schedules
// ---------------------------------------------------------------------------
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

  const parsed = downgradeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 422 })
  }

  const requestedTier = normalizeSubscriptionTier(parsed.data.tier)

  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({ where: { userId: user.id } }),
  )

  if (!profile || !profile.stripeCustomerId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 })
  }

  // Validate this is a downgrade
  const currentTierIndex = PLAN_ORDER.indexOf(normalizeSubscriptionTier(profile.subscriptionTier))
  const requestedTierIndex = PLAN_ORDER.indexOf(requestedTier)
  if (requestedTierIndex >= currentTierIndex) {
    return NextResponse.json(
      { error: "Target tier must be lower than current tier" },
      { status: 400 },
    )
  }

  // Resolve new price ID
  const newPriceId = PRICE_ID_BY_TIER[requestedTier]
  if (!newPriceId) {
    return NextResponse.json(
      { error: `Price ID not configured for tier: ${requestedTier}` },
      { status: 500 },
    )
  }

  // Resolve subscription ID — use stored value or fall back to Stripe API lookup
  let subscriptionId = profile.stripeSubscriptionId
  if (!subscriptionId) {
    const subs = await stripe.subscriptions.list({
      customer: profile.stripeCustomerId,
      status: "active",
      limit: 1,
    })
    subscriptionId = subs.data[0]?.id ?? null
  }
  if (!subscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 })
  }

  try {
    const subscription = (await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice"],
    })) as Stripe.Subscription & { latest_invoice: Stripe.Invoice | null }
    const currentPriceId = subscription.items.data[0]?.price?.id
    const currentPeriodEnd = subscription.latest_invoice?.period_end

    if (!currentPriceId) {
      return NextResponse.json({ error: "Could not determine current price" }, { status: 500 })
    }
    if (!currentPeriodEnd) {
      return NextResponse.json({ error: "Could not determine billing period end" }, { status: 500 })
    }

    // Create a schedule from the existing subscription.
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    })

    // When updating phases, the first phase's start_date must match the
    // schedule's existing phase start_date — omitting it can cause a 400.
    const phaseStartDate = schedule.phases[0]?.start_date

    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          ...(phaseStartDate ? { start_date: phaseStartDate } : {}),
          items: [{ price: currentPriceId, quantity: 1 }],
          end_date: currentPeriodEnd,
        },
        {
          items: [{ price: newPriceId, quantity: 1 }],
        },
      ],
    })

    // Persist pending state
    await withUserContext(user.id, (tx) =>
      tx.userProfile.update({
        where: { userId: user.id },
        data: {
          pendingDowngradeTier: requestedTier,
          stripeScheduleId: schedule.id,
        },
      }),
    )

    const scheduledAt = new Date(currentPeriodEnd * 1000)
    const message = `Your plan will change on ${scheduledAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}. You can cancel before then.`

    return NextResponse.json({
      scheduledAt: scheduledAt.toISOString(),
      message,
    })
  } catch (err) {
    console.error("[POST /api/billing/downgrade] Stripe error:", err)
    return NextResponse.json({ error: "Failed to schedule downgrade" }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE — cancel a pending scheduled downgrade by releasing the schedule
// ---------------------------------------------------------------------------
export async function DELETE() {
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
    tx.userProfile.findUnique({ where: { userId: user.id } }),
  )

  if (!profile || !profile.stripeScheduleId) {
    return NextResponse.json({ error: "No pending downgrade to cancel" }, { status: 400 })
  }

  try {
    await stripe.subscriptionSchedules.release(profile.stripeScheduleId)

    await withUserContext(user.id, (tx) =>
      tx.userProfile.update({
        where: { userId: user.id },
        data: { pendingDowngradeTier: null, stripeScheduleId: null },
      }),
    )

    return NextResponse.json({ cancelled: true })
  } catch (err) {
    console.error("[DELETE /api/billing/downgrade] Stripe error:", err)
    return NextResponse.json({ error: "Failed to cancel downgrade" }, { status: 500 })
  }
}
