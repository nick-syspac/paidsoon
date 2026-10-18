import "server-only"
import type Stripe from "stripe"
import type { Prisma, UserProfile } from "@/lib/generated/prisma/client"
import { claimStripeTrialRecovery, finalizeStripeTrialInTransaction, stripeTrialEventProof,
  type StripeTrialEventEvidence } from "@/lib/billing/stripeTrialFinalization"

/** INTERNAL signed-event seam, called only inside the coordinator transaction.
 * Never nests a tenant lock/transaction, mutates Stripe or uses a customer fence.
 * A live executor keeps its lease; persist attributable evidence for later recovery.
 * An expired lease can be fenced forward, but never simply cleared. */
export async function finalizeStripeTrialWebhookInTransaction(
  tx: Prisma.TransactionClient, profile: UserProfile, stripe: Stripe, event: StripeTrialEventEvidence,
): Promise<boolean> {
  if (!profile.pendingTrialOperationId || profile.pendingBillingMutationId || !event.request ||
      (!event.request.id && !event.request.idempotency_key)) return false
  const op = await tx.tenantTrialOperation.findUnique({ where: { id: profile.pendingTrialOperationId } })
  if (!op || op.userId !== profile.userId || !["pending", "reconciliation_required"].includes(op.status)) return false
  const proof = stripeTrialEventProof(op, event)
  if (!proof) return false
  await tx.tenantTrialOperation.update({ where: { id: op.id }, data: {
    providerResult: JSON.parse(JSON.stringify(proof)) as Prisma.InputJsonObject, stripeRequestId: proof.requestId,
  } })
  // Reuse the already durable original actor attribution, not an invented system
  // owner/email or a customer's completed operation identity.
  const attempt = await tx.adminAuditEvent.findFirst({ where: { resourceId: op.id, tenantId: op.userId,
    actorUserId: op.actorUserId, adminSessionId: op.adminSessionId, action: "admin_tenant_action",
    metadata: { path: ["action"], equals: "trial_attempt" } } })
  if (!attempt) return false
  const fence = await claimStripeTrialRecovery(tx, profile, op, new Date())
  if (!fence) return false
  await finalizeStripeTrialInTransaction({ tx, profile, op, fence, stripe, proof, now: () => new Date(), allowSupersession: true,
    eventCreatedAt: event.createdAt,
    audit: { operationId: op.id, operationAction: op.action, source: op.source, tenantId: op.userId, reason: op.reason,
      actor: { actorUserId: op.actorUserId, actorEmail: attempt.actorEmail, platformRole: "platform_owner",
        adminSessionId: op.adminSessionId, ...(attempt.adminDeviceId ? { adminDeviceId: attempt.adminDeviceId } : {}),
        ipAddress: attempt.ipAddress, userAgent: attempt.userAgent, requestId: event.eventId } } })
  return true
}