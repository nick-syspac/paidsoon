import { createHash } from "node:crypto"

import { prismaAdmin } from "@/lib/db/admin"
import { getDepositPaymentProvider } from "@/lib/depositGuard/payments"
import type {
  DepositPaymentProviderName,
  DepositPaymentWebhookResult,
} from "@/lib/depositGuard/payments/types"

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "P2002"
  )
}

function hashPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex")
}

async function persistWebhookDelivery(
  provider: DepositPaymentProviderName,
  payload: string,
  parsed: DepositPaymentWebhookResult,
): Promise<"created" | "duplicate" | "skipped"> {
  if (!parsed.providerEventId) {
    return "skipped"
  }

  try {
    await prismaAdmin.depositPaymentWebhookEvent.create({
      data: {
        provider,
        providerEventId: parsed.providerEventId,
        eventType: parsed.eventType ?? "unknown",
        processingStatus: parsed.acknowledged ? "processed" : "skipped",
        processingNote: parsed.reasonCode ?? null,
        payloadHash: hashPayload(payload),
        userId: parsed.userId ?? null,
        jobId: parsed.jobId ?? null,
        depositRequestId: parsed.depositRequestId ?? null,
        externalPaymentReference: parsed.externalPaymentReference ?? null,
        processedAt: new Date(),
      },
    })
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate"
    throw error
  }

  return "created"
}

/**
 * This helper intentionally uses prismaAdmin because webhook processing runs
 * without a user JWT and must persist idempotency state before reconciliation.
 */
export async function processDepositPaymentWebhook(input: {
  provider: DepositPaymentProviderName
  payload: string
  signature: string | null
}): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  const provider = getDepositPaymentProvider(input.provider)
  const parsed = await provider.processWebhook(input.payload, input.signature)

  if (parsed.reasonCode === "invalid_signature") {
    return {
      status: 400,
      body: { error: "Invalid signature" },
    }
  }

  const persisted = await persistWebhookDelivery(
    input.provider,
    input.payload,
    parsed,
  )

  if (persisted === "duplicate") {
    return {
      status: 200,
      body: { received: true, deduped: true },
    }
  }

  return {
    status: 200,
    body: {
      received: true,
      acknowledged: parsed.acknowledged,
      eventType: parsed.eventType ?? null,
      externalPaymentReference: parsed.externalPaymentReference ?? null,
      ignored: !parsed.acknowledged,
    },
  }
}
