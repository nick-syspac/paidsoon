import { NextResponse } from "next/server"
import { prismaAdmin as prisma } from "@/lib/db/admin"
import {
  resolveEmailLogStatus,
  verifyResendWebhookSignature,
  type ResendWebhookEvent,
} from "@/lib/email/resendWebhook"

/**
 * Receives Resend delivery-status webhooks (delivered/bounced/complained)
 * and updates the matching `EmailLog` row. Uses prismaAdmin — this route has
 * no user session, matching the existing Stripe webhook convention.
 */
export async function POST(request: Request) {
  const payload = await request.text()

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    // Fail closed: an unset/empty secret must never be treated as a valid
    // verification key, which would turn signature checking into a no-op.
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const isValid = verifyResendWebhookSignature(
    payload,
    {
      "svix-id": request.headers.get("svix-id"),
      "svix-timestamp": request.headers.get("svix-timestamp"),
      "svix-signature": request.headers.get("svix-signature"),
    },
    webhookSecret,
  )

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  let event: ResendWebhookEvent
  try {
    event = JSON.parse(payload)
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const status = resolveEmailLogStatus(event.type)
  const messageId = event.data?.email_id

  if (status && messageId) {
    await prisma.emailLog.updateMany({
      where: { resendMessageId: messageId },
      data: { status },
    })
  }

  // Unmatched/unhandled events still return success — Resend retries on
  // non-2xx, and there is nothing to correct for an event this system has
  // no EmailLog row to update.
  return NextResponse.json({ received: true })
}
