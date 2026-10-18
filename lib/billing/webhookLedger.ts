import "server-only"
import { randomUUID } from "node:crypto"
import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma } from "@/lib/generated/prisma/client"

export const WEBHOOK_LEASE_MS = 60_000

/** Immutable executor identity. Never recover a token by reading the current row. */
export type WebhookClaim = Readonly<{ stripeEventId: string; token: string }>
type LedgerClient = Pick<Prisma.TransactionClient, "stripeBillingWebhookEvent">
type Receipt = { stripeEventId: string; eventType: string; eventCreatedAt: Date }

export class WebhookClaimLostError extends Error {
  constructor() { super("webhook_claim_lost") }
}

// Intentional RLS bypass: only the signature-verified billing webhook calls this
// system ledger. Receipt and CAS claims are durable independently of processing.
export async function claimWebhookEvent(receipt: Receipt): Promise<
  { kind: "claimed"; claim: WebhookClaim } | { kind: "terminal" } | { kind: "busy" }
> {
  try {
    await prismaAdmin.stripeBillingWebhookEvent.create({ data: receipt })
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error
  }
  const now = new Date()
  const token = randomUUID()
  const result = await prismaAdmin.stripeBillingWebhookEvent.updateMany({
    where: {
      stripeEventId: receipt.stripeEventId,
      OR: [
        { processingStatus: { in: ["received", "failed"] } },
        { processingStatus: "processing", processingLeaseUntil: null },
        { processingStatus: "processing", processingLeaseUntil: { lte: now } },
      ],
    },
    data: {
      processingStatus: "processing", processingToken: token,
      processingLeaseUntil: new Date(now.getTime() + WEBHOOK_LEASE_MS),
      processingNote: null, processedAt: null,
    },
  })
  if (result.count === 1) return { kind: "claimed", claim: Object.freeze({ stripeEventId: receipt.stripeEventId, token }) }
  const row = await prismaAdmin.stripeBillingWebhookEvent.findUnique({
    where: { stripeEventId: receipt.stripeEventId }, select: { processingStatus: true },
  })
  return { kind: row && ["processed", "skipped"].includes(row.processingStatus) ? "terminal" : "busy" }
}

function ownedClaimWhere(claim: WebhookClaim, now: Date): Prisma.StripeBillingWebhookEventWhereInput {
  return {
    stripeEventId: claim.stripeEventId, processingStatus: "processing",
    processingToken: claim.token, processingLeaseUntil: { gt: now },
  }
}

/**
 * Commit fence for the tenant coordinator: call INSIDE its transaction,
 * after provider reads and before writes. This conditional UPDATE locks the ledger
 * row until commit, preventing takeover during the fenced transaction. A separate
 * read/check cannot protect a commit. It does not serialize DIFFERENT events;
 * the coordinator acquires the tenant lock before calling this fence.
 */
export async function assertWebhookClaim(tx: LedgerClient, claim: WebhookClaim): Promise<void> {
  const result = await tx.stripeBillingWebhookEvent.updateMany({
    where: ownedClaimWhere(claim, new Date()), data: { processingToken: claim.token },
  })
  if (result.count !== 1) throw new WebhookClaimLostError()
}

// Low-level fence utility, not a billing projection writer. Projection/risk
// writers use coordinateTenantBilling for tenant locking and atomic completion.
export async function withWebhookClaimCommit<T>(
  claim: WebhookClaim, write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prismaAdmin.$transaction(async (tx) => {
    await assertWebhookClaim(tx, claim)
    return write(tx)
  })
}

export async function finishWebhookEvent(
  claim: WebhookClaim, status: "processed" | "skipped" | "failed", note?: string,
): Promise<void> {
  await finishWebhookEventInTransaction(prismaAdmin, claim, status, note)
}

/** Projection/risk writers MUST finish on their transaction, never after commit. */
export async function finishWebhookEventInTransaction(
  tx: LedgerClient, claim: WebhookClaim,
  status: "processed" | "skipped" | "failed", note?: string,
): Promise<void> {
  const result = await tx.stripeBillingWebhookEvent.updateMany({
    where: ownedClaimWhere(claim, new Date()),
    data: {
      processingStatus: status, processingNote: note ?? null,
      processedAt: status === "failed" ? null : new Date(),
      processingToken: null, processingLeaseUntil: null,
    },
  })
  if (result.count !== 1) throw new WebhookClaimLostError()
}