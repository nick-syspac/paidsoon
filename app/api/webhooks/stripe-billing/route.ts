import { prismaAdmin as prisma } from "@/lib/db/admin"
import { getInvoiceLimitForTier } from "@/lib/billing"
import { retrieveSubscriptionWithLatestInvoice } from "@/lib/billing/stripeSubscriptions"
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
    ? { [process.env.STRIPE_STARTER_PRICE_ID]: "essentials" as const }
    : {}),
  ...(process.env.STRIPE_SOLO_PRICE_ID
    ? { [process.env.STRIPE_SOLO_PRICE_ID]: "business_control" as const }
    : {}),
  ...(process.env.STRIPE_SMALL_BUSINESS_PRICE_ID
    ? { [process.env.STRIPE_SMALL_BUSINESS_PRICE_ID]: "small_business" as const }
    : {}),
  ...(process.env.STRIPE_BUSINESS_PRO_PRICE_ID
    ? { [process.env.STRIPE_BUSINESS_PRO_PRICE_ID]: "business_pro" as const }
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

function toDateFromUnix(seconds: number): Date {
  return new Date(seconds * 1000)
}

function resolveEventUserId(event: Stripe.Event): string | null {
  const objectWithMetadata = event.data.object as { metadata?: Record<string, string | undefined> }
  const userId = objectWithMetadata.metadata?.userId ?? objectWithMetadata.metadata?.user_id
  return userId ?? null
}

function resolveEventCustomerId(event: Stripe.Event): string | null {
  const obj = event.data.object as { customer?: string | Stripe.Customer | null }
  const customer = obj.customer
  if (!customer) return null
  return typeof customer === "string" ? customer : customer.id
}

function resolveEventSubscriptionId(event: Stripe.Event): string | null {
  const obj = event.data.object as {
    id?: string
    object?: string
    subscription?: string | Stripe.Subscription | null
  }
  if (obj.object === "subscription" && obj.id) return obj.id
  const sub = obj.subscription
  if (!sub) return null
  return typeof sub === "string" ? sub : sub.id
}

async function markEventProcessed(
  stripeEventId: string,
  processingStatus: "processed" | "skipped" | "failed",
  processingNote?: string,
) {
  await prisma.stripeBillingWebhookEvent.update({
    where: { stripeEventId },
    data: {
      processingStatus,
      processingNote: processingNote ?? null,
      processedAt: new Date(),
    },
  })
}

async function shouldSkipAsStale(
  userId: string,
  eventCreatedAt: Date,
): Promise<boolean> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { latestStripeEventCreatedAt: true },
  })
  if (!profile?.latestStripeEventCreatedAt) return false
  return eventCreatedAt.getTime() < profile.latestStripeEventCreatedAt.getTime()
}

async function resolveProfileForEvent({
  userId,
  stripeCustomerId,
  stripeSubscriptionId,
}: {
  userId?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
}) {
  if (userId) {
    const byUserId = await prisma.userProfile.findUnique({ where: { userId } })
    if (byUserId) return byUserId
  }

  if (stripeCustomerId) {
    const byCustomer = await prisma.userProfile.findFirst({
      where: { stripeCustomerId },
    })
    if (byCustomer) return byCustomer
  }

  if (stripeSubscriptionId) {
    return prisma.userProfile.findFirst({
      where: { stripeSubscriptionId },
    })
  }

  return null
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

  const eventCreatedAt = toDateFromUnix(event.created)
  const eventUserId = resolveEventUserId(event)
  const eventCustomerId = resolveEventCustomerId(event)
  const eventSubscriptionId = resolveEventSubscriptionId(event)
  console.info("[billing/webhook] received", {
    stripeEventId: event.id,
    eventType: event.type,
    hasUserId: Boolean(eventUserId),
    hasCustomerId: Boolean(eventCustomerId),
    hasSubscriptionId: Boolean(eventSubscriptionId),
  })

  try {
    await prisma.stripeBillingWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
        eventCreatedAt,
        processingStatus: "received",
        userId: eventUserId,
        stripeCustomerId: eventCustomerId,
        stripeSubscriptionId: eventSubscriptionId,
      },
    })
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : null
    if (code === "P2002") {
      // Event was already seen and processed/retried by Stripe.
      return NextResponse.json({ received: true, deduped: true })
    }
    // Non-idempotency persistence issue; surface to trigger Stripe retry.
    throw error
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId ?? session.metadata?.user_id
      if (userId && session.subscription) {
        if (await shouldSkipAsStale(userId, eventCreatedAt)) {
          await markEventProcessed(event.id, "skipped", "stale_event")
          break
        }
        const checkoutTier = normalizeSubscriptionTier(session.metadata?.selectedTier)
        const subscriptionId = session.subscription as string
        // Fetch subscription and expand latest_invoice to get period_end
        // (current_period_end was removed from Subscription in API 2026-05-27)
        const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
        const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
        const periodStart = latestInvoice?.period_start ? new Date(latestInvoice.period_start * 1000) : null
        const periodEnd = latestInvoice?.period_end ? new Date(latestInvoice.period_end * 1000) : null
        await prisma.userProfile.update({
          where: { userId },
          data: {
            subscriptionTier: checkoutTier,
            subscriptionStatus: subscription.status,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscriptionId,
            stripePriceId: subscription.items.data[0]?.price?.id ?? null,
            subscriptionCurrentPeriodStart: periodStart,
            subscriptionCurrentPeriodEnd: periodEnd,
            subscriptionCancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
            subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
            latestStripeEventCreatedAt: eventCreatedAt,
            trialEndsAt:
              subscription.trial_end != null
                ? new Date(subscription.trial_end * 1000)
                : null,
          },
        })
      }
      await markEventProcessed(event.id, "processed")
      break
    }

    case "customer.subscription.created":

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription
      const profile = await resolveProfileForEvent({
        userId: eventUserId,
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscription.id,
      })
      if (profile) {
        if (await shouldSkipAsStale(profile.userId, eventCreatedAt)) {
          await markEventProcessed(event.id, "skipped", "stale_event")
          break
        }
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
        const subExpanded = await retrieveSubscriptionWithLatestInvoice(stripe, subscription.id)
        const latestInv = subExpanded.latest_invoice as Stripe.Invoice | null
        const periodStart = latestInv?.period_start ? new Date(latestInv.period_start * 1000) : null
        const periodEnd = latestInv?.period_end ? new Date(latestInv.period_end * 1000) : null
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: {
            subscriptionTier: tier,
            subscriptionStatus: subscription.status,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price?.id ?? null,
            subscriptionCurrentPeriodStart: periodStart,
            subscriptionCurrentPeriodEnd: periodEnd,
            subscriptionCancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
            subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
            latestStripeEventCreatedAt: eventCreatedAt,
            trialEndsAt:
              subscription.trial_end != null
                ? new Date(subscription.trial_end * 1000)
                : null,
            ...(scheduleExecuted
              ? { pendingDowngradeTier: null, stripeScheduleId: null }
              : {}),
          },
        })
      }
      await markEventProcessed(event.id, "processed")
      break
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription
      const profile = await resolveProfileForEvent({
        userId: eventUserId,
        stripeCustomerId: subscription.customer as string,
        stripeSubscriptionId: subscription.id,
      })
      if (profile) {
        if (await shouldSkipAsStale(profile.userId, eventCreatedAt)) {
          await markEventProcessed(event.id, "skipped", "stale_event")
          break
        }
        // Revert to essentials tier
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: {
            subscriptionTier: DEFAULT_SUBSCRIPTION_TIER,
            subscriptionStatus: "canceled",
            stripePriceId: null,
            subscriptionCancelAt: null,
            subscriptionCancelAtPeriodEnd: false,
            latestStripeEventCreatedAt: eventCreatedAt,
            trialEndsAt: null,
          },
        })

        // Pause invoices over essentials limit.
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
      await markEventProcessed(event.id, "processed")
      break
    }

    case "subscription_schedule.released": {
      // Fired when a schedule is released (cancelled) — clear pending downgrade state.
      const schedule = event.data.object as Stripe.SubscriptionSchedule
      const profile = await prisma.userProfile.findFirst({
        where: { stripeScheduleId: schedule.id },
      })
      if (profile) {
        if (await shouldSkipAsStale(profile.userId, eventCreatedAt)) {
          await markEventProcessed(event.id, "skipped", "stale_event")
          break
        }
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: {
            pendingDowngradeTier: null,
            stripeScheduleId: null,
            latestStripeEventCreatedAt: eventCreatedAt,
          },
        })
      }
      await markEventProcessed(event.id, "processed")
      break
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      const profile = await resolveProfileForEvent({
        userId: eventUserId,
        stripeCustomerId: invoice.customer as string,
      })
      if (profile) {
        if (await shouldSkipAsStale(profile.userId, eventCreatedAt)) {
          await markEventProcessed(event.id, "skipped", "stale_event")
          break
        }
        // Tier is left unchanged: access is only revoked by an explicit
        // customer.subscription.deleted event, not a past-due status alone.
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: {
            subscriptionStatus: "past_due",
            latestStripeEventCreatedAt: eventCreatedAt,
          },
        })
      }
      await markEventProcessed(event.id, "processed")
      break
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice
      const profile = await resolveProfileForEvent({
        userId: eventUserId,
        stripeCustomerId: invoice.customer as string,
      })
      if (profile) {
        if (await shouldSkipAsStale(profile.userId, eventCreatedAt)) {
          await markEventProcessed(event.id, "skipped", "stale_event")
          break
        }
        await prisma.userProfile.update({
          where: { userId: profile.userId },
          data: {
            subscriptionStatus: "active",
            latestStripeEventCreatedAt: eventCreatedAt,
          },
        })
      }
      await markEventProcessed(event.id, "processed")
      break
    }

    case "customer.subscription.trial_will_end": {
      // No state mutation required; this event is observed for operational visibility.
      await markEventProcessed(event.id, "processed", "trial_will_end_observed")
      break
    }

    default:
      await markEventProcessed(event.id, "skipped", "unhandled_event_type")
      break
  }

  return NextResponse.json({ received: true })
}
