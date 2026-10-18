import { prismaAdmin as prisma } from "@/lib/db/admin"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { reconcileBillingRiskEvent } from "@/lib/billing/riskReconciliation"
import { reconcileTenantSubscription, reconcileTenantScheduleRelease } from "@/lib/billing/tenantBillingCoordinator"
import { reconcileHostedCheckout } from "@/lib/billing/hostedCheckoutLifecycle"
import {
  claimWebhookEvent, finishWebhookEvent,
  type WebhookClaim,
} from "@/lib/billing/webhookLedger"
import { z } from "zod"
import {
  retrieveSubscriptionWithLatestInvoice,
  resolveStripeBillingProfile,
  stripeObjectId,
  stripeTimestamp,
  type StripeBillingIdentity,
} from "@/lib/billing/stripeSubscriptions"
import { NextResponse } from "next/server"
import type Stripe from "stripe"

const eventReceiptSchema = z.object({
  id: z.string().trim().min(1), type: z.string().trim().min(1),
  created: z.number().int().nonnegative().max(8_640_000_000_000),
})

// Validate object hints only AFTER claiming, and only for handled types. Unknown
// events need no object schema; malformed metadata cannot escape receipt/failure.
const billingObjectSchema = z.object({
  metadata: z.record(z.string(), z.string()).nullish(),
}).passthrough()
const identifiedBillingObjectSchema = billingObjectSchema.extend({ id: z.string().min(1) })

// Signed webhooks intentionally bypass RLS; binding checks precede projection.
function resolveProfileFromSources(sources: StripeBillingIdentity[], subscriptionId: string | null) {
  return resolveStripeBillingProfile({
    byUserId: (userId) => prisma.userProfile.findUnique({ where: { userId } }),
    byCustomerId: (stripeCustomerId) => prisma.userProfile.findFirst({ where: { stripeCustomerId } }),
    bySubscriptionId: (stripeSubscriptionId) => prisma.userProfile.findFirst({ where: { stripeSubscriptionId } }),
  }, sources, subscriptionId)
}

// Must use raw body for Stripe signature verification
export async function POST(request: Request): Promise<NextResponse> {
  let stripe: Stripe
  let payload: string
  try {
    stripe = createStripeClient()
    payload = await request.text()
  } catch {
    console.error("[billing/webhook] initialization unavailable")
    return retryableFailure()
  }
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

  let claim: WebhookClaim | undefined
  try {
    const receipt = eventReceiptSchema.parse(event)
    const eventCreatedAt = stripeTimestamp(receipt.created)!
    const result = await claimWebhookEvent({
      stripeEventId: receipt.id, eventType: receipt.type, eventCreatedAt,
    })
    if (result.kind === "terminal") {
      return NextResponse.json({ received: true, deduped: true })
    }
    if (result.kind === "busy") return retryableFailure()
    claim = result.claim
    await processClaimedEvent(stripe, event, eventCreatedAt, claim)
    return NextResponse.json({ received: true })
  } catch {
    if (claim) {
      try {
        await finishWebhookEvent(claim, "failed", "billing_reconciliation_failed")
      } catch {
        // Lost fence or unavailable DB: never overwrite another executor. The
        // durable processing lease expires so Stripe can reclaim on redelivery.
      }
    }
    // Do not log provider/database errors or delivered metadata (may contain PII).
    console.error("[billing/webhook] processing unavailable")
    return retryableFailure()
  }
}

async function processClaimedEvent(
  stripe: Stripe, event: Stripe.Event, eventCreatedAt: Date, ownedClaim: WebhookClaim,
): Promise<void> {
  // Captures the ORIGINAL token on every finish path, including catch/failure.
  const markEventProcessed = (_id: string, status: "processed" | "skipped", note?: string) =>
    finishWebhookEvent(ownedClaim, status, note)
  const context = { kind: "webhook" as const, claim: ownedClaim, eventCreatedAt }

  switch (event.type) {
    case "checkout.session.completed": {
      identifiedBillingObjectSchema.parse(event.data.object)
      // Delivered fields are retrieval hints only. The coordinator repeats this
      // read and verifies current binding under the tenant lock before committing.
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id)
      const subscriptionId = stripeObjectId(session.subscription)
      if (subscriptionId) {
        const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
        const profile = await resolveProfileFromSources([session, subscription], subscriptionId)
        if (!profile) {
          await markEventProcessed(event.id, "skipped", "profile_not_found")
          break
        }
        await reconcileHostedCheckout(stripe, profile.userId, session.id, context)
        break // Projection and terminal ledger transition committed together.
      }
      throw new Error("missing_checkout_subscription")
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      identifiedBillingObjectSchema.parse(event.data.object)
      const delivered = event.data.object as Stripe.Subscription
      const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, delivered.id)
      const profile = await resolveProfileFromSources([delivered, subscription], delivered.id)
      if (profile) {
        await reconcileTenantSubscription(stripe, profile.userId, delivered.id, {
          ...context,
          ...(event.type === "customer.subscription.updated" ? { trialEvent: {
            eventId: event.id, createdAt: eventCreatedAt, request: event.request, delivered,
          } } : {}),
        }, [delivered])
        break
      }
      await markEventProcessed(event.id, "processed")
      break
    }

    case "subscription_schedule.released": {
      identifiedBillingObjectSchema.parse(event.data.object)
      // Fired when a schedule is released (cancelled) — clear pending downgrade state.
      const schedule = event.data.object as Stripe.SubscriptionSchedule
      const profile = await prisma.userProfile.findFirst({
        where: { stripeScheduleId: schedule.id },
      })
      if (profile) {
        await reconcileTenantScheduleRelease(stripe, profile.userId, schedule.id, context)
        break
      }
      await markEventProcessed(event.id, "processed")
      break
    }

    case "invoice.payment_failed":
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.updated":
    case "invoice.finalized":
    case "invoice.marked_uncollectible":
    case "invoice.voided":
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      if (event.account) {
        await markEventProcessed(event.id, "skipped", "connect_account_event")
        break
      }
      // Delivered status/customer/metadata and global event timestamps cannot
      // resolve an independent risk. Only the object ID is a retrieval hint.
      const id = stripeObjectId(event.data.object)
      if (!id) throw new Error("missing_billing_object_id")
      await reconcileBillingRiskEvent(stripe, {
        kind: event.type.startsWith("invoice.") ? "subscription_invoice" : "subscription_dispute",
        id,
      }, event.id, new Date(), ownedClaim)
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
}

function retryableFailure(): NextResponse {
  return NextResponse.json({ error: "Billing reconciliation unavailable" }, {
    status: 503, headers: { "Retry-After": "60" },
  })
}
