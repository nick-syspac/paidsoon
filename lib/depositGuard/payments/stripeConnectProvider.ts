import Stripe from "stripe"

import type {
  DepositPaymentProvider,
  DepositPaymentCreateInput,
  DepositPaymentCreateResult,
  DepositPaymentWebhookResult,
} from "@/lib/depositGuard/payments/types"

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("Stripe secret key is not configured")
  }

  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" })
}

function resolveWebhookSecret(): string | null {
  return (
    process.env.STRIPE_DEPOSIT_WEBHOOK_SECRET ??
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET ??
    null
  )
}

export class StripeConnectDepositPaymentProvider implements DepositPaymentProvider {
  readonly name = "stripe_connect" as const

  async createPaymentRequest(
    _input: DepositPaymentCreateInput,
  ): Promise<DepositPaymentCreateResult> {
    return {
      provider: this.name,
      availability: "unavailable",
      reasonCode: "setup_required",
      reasonMessage:
        "Stripe connected-account collection is not configured for DepositGuard yet.",
    }
  }

  async processWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<DepositPaymentWebhookResult> {
    const secret = resolveWebhookSecret()
    if (!secret || !signature) {
      return {
        acknowledged: false,
        reasonCode: "invalid_signature",
        reasonMessage: "Missing Stripe webhook signature or secret.",
      }
    }

    let event: Stripe.Event
    try {
      event = getStripe().webhooks.constructEvent(rawBody, signature, secret)
    } catch {
      return {
        acknowledged: false,
        reasonCode: "invalid_signature",
        reasonMessage: "Invalid Stripe webhook signature.",
      }
    }

    const objectWithMetadata = event.data.object as {
      id?: string
      metadata?: Record<string, string | undefined>
      payment_intent?: string | Stripe.PaymentIntent | null
    }

    const metadata = objectWithMetadata.metadata ?? {}
    const externalPaymentReference =
      typeof objectWithMetadata.id === "string"
        ? objectWithMetadata.id
        : metadata.externalPaymentReference ?? metadata.paymentReference

    if (event.type === "payment_intent.succeeded") {
      return {
        acknowledged: true,
        providerEventId: event.id,
        eventType: event.type,
        userId: metadata.userId,
        jobId: metadata.jobId,
        depositRequestId: metadata.requestId,
        externalPaymentReference,
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      return {
        acknowledged: true,
        providerEventId: event.id,
        eventType: event.type,
        userId: metadata.userId,
        jobId: metadata.jobId,
        depositRequestId: metadata.requestId,
        externalPaymentReference,
      }
    }

    if (event.type === "checkout.session.completed") {
      const paymentIntent = objectWithMetadata.payment_intent
      const paymentReference =
        typeof paymentIntent === "string"
          ? paymentIntent
          : paymentIntent?.id ?? externalPaymentReference

      return {
        acknowledged: true,
        providerEventId: event.id,
        eventType: event.type,
        userId: metadata.userId,
        jobId: metadata.jobId,
        depositRequestId: metadata.requestId,
        externalPaymentReference: paymentReference,
      }
    }

    return {
      acknowledged: false,
      providerEventId: event.id,
      eventType: event.type,
      reasonCode: "unsupported",
      reasonMessage: "Stripe event type is not handled by DepositGuard payment webhooks.",
    }
  }
}
