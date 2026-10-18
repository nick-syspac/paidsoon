import "server-only"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"
import { randomUUID } from "node:crypto"
import type Stripe from "stripe"
import { z } from "zod"
import type { Prisma, TenantTrialOperation, UserProfile } from "@/lib/generated/prisma/client"
import { writeTrialAuditEvent, type TrialAuditEventInput } from "@/lib/admin/audit"
import { assertBillingFence, assertBillingReservation, type OwnerBillingFence } from "@/lib/billing/tenantBillingFence"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { resolveTrialEligibility, type TrialBillingRiskEvidence } from "@/lib/billing/trialEligibility"
import { reconcileStripeSubscription, retrieveSubscriptionWithLatestInvoice, stripeSnapshotProfileData, stripeTierForPrice } from "@/lib/billing/stripeSubscriptions"
import { safeTrialAccessSnapshot, TrialPreviewError } from "@/lib/billing/trialAccessPreview"
import { trialOperationAuditSnapshot } from "@/lib/billing/trialAccessOperations"
import type { StripeTrialExtensionOutcome } from "@/lib/billing/stripeTrialExtension"

export const STRIPE_TRIAL_LEASE_MS = 60_000
export const STRIPE_TRIAL_RETENTION_MS = 24 * 60 * 60 * 1000
export const trialPending = (operationId: string): StripeTrialExtensionOutcome => ({
  operationId, source: "stripe_trial", status: "reconciliation_required", reconciliationRequired: true,
})
const json = (value: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject
const missing = (): never => { throw new TrialPreviewError("trial_operation_evidence_missing", 409) }

export function supportedStripeTrial(subscription: Stripe.Subscription): boolean {
  const item = subscription.items?.data[0]
  return subscription.status === "trialing" && subscription.items?.has_more === false && subscription.items.data.length === 1 &&
    item?.quantity === 1 && item.price.type === "recurring" && item.price.recurring?.usage_type === "licensed" &&
    subscription.schedule === null && subscription.cancel_at === null && subscription.cancel_at_period_end === false &&
    subscription.pending_update === null && subscription.pause_collection === null && subscription.pending_invoice_item_interval === null &&
    subscription.next_pending_invoice_item_invoice === null
}

const proofSchema = z.object({
  operationId: z.uuid(), subscriptionId: z.string().min(1), customerId: z.string().min(1),
  trialEnd: z.number().int(), priceId: z.string().min(1), key: z.string().min(1),
  firstAttemptAt: z.iso.datetime(), outcome: z.literal("succeeded"),
  evidence: z.enum(["response", "signed_event"]), requestId: z.string().min(1).nullable(),
  eventId: z.string().min(1).optional(),
})
export type StripeTrialProof = z.infer<typeof proofSchema>
export interface StripeTrialEventEvidence {
  eventId: string
  createdAt: Date
  request: { id: string | null; idempotency_key?: string | null } | null
  delivered: Stripe.Subscription
}

export function assertStripeTrialIntent(op: TenantTrialOperation): void {
  if (op.source !== "stripe_trial" || op.action !== "extend_or_grant" || !op.targetPlan || !op.targetExpiresAt ||
      !op.stripeCustomerId || !op.stripeSubscriptionId || !op.firstAttemptAt || op.attempts < 1 ||
      op.targetExpiresAt.getTime() % 1000 !== 0 || op.stripeIdempotencyKey !== `trial-extension/${op.id}`) missing()
}

/** Provider response/event proves the ORIGINAL request, never today's billing truth. */
export function stripeTrialResponseProof(op: TenantTrialOperation, response: Stripe.Subscription,
  requestId: string | null = null): StripeTrialProof | null {
  assertStripeTrialIntent(op)
  try {
    const verified = reconcileStripeSubscription({ ...response, latest_invoice: null }, {
      subscriptionId: op.stripeSubscriptionId!, binding: { userId: op.userId,
        stripeCustomerId: op.stripeCustomerId, stripeSubscriptionId: op.stripeSubscriptionId },
    })
    if (verified.kind !== "current" || verified.snapshot.status !== "trialing" ||
        verified.snapshot.tier !== op.targetPlan || response.trial_end !== op.targetExpiresAt!.getTime() / 1000) return null
    return { operationId: op.id, subscriptionId: response.id, customerId: verified.snapshot.customerId,
      trialEnd: response.trial_end, priceId: verified.snapshot.priceId, key: op.stripeIdempotencyKey!,
      firstAttemptAt: op.firstAttemptAt!.toISOString(), outcome: "succeeded", evidence: "response", requestId }
  } catch { return null }
}

export function storedStripeTrialProof(op: TenantTrialOperation): StripeTrialProof | null {
  assertStripeTrialIntent(op)
  // Task 4.4 already persisted keyed response evidence before this shared format.
  // Accept that exact durable allowlist, never infer proof from today's date.
  const legacy = proofSchema.omit({ operationId: true, customerId: true, evidence: true, requestId: true, eventId: true })
    .strict().safeParse(op.providerResult)
  const parsed = proofSchema.safeParse(legacy.success ? { ...legacy.data, operationId: op.id,
    customerId: op.stripeCustomerId, evidence: "response", requestId: op.stripeRequestId } : op.providerResult)
  if (!parsed.success) return null
  const p = parsed.data
  try { if (stripeTierForPrice(p.priceId) !== op.targetPlan) return null } catch { return null }
  return p.operationId === op.id && p.subscriptionId === op.stripeSubscriptionId && p.customerId === op.stripeCustomerId &&
    p.trialEnd === op.targetExpiresAt!.getTime() / 1000 && p.key === op.stripeIdempotencyKey &&
    p.firstAttemptAt === op.firstAttemptAt!.toISOString() && (p.evidence !== "signed_event" || !!p.eventId) ? p : null
}

export function stripeTrialEventProof(op: TenantTrialOperation, event: StripeTrialEventEvidence): StripeTrialProof | null {
  assertStripeTrialIntent(op)
  if (!event.request || (!event.request.idempotency_key && !event.request.id) ||
      (event.request.idempotency_key && event.request.idempotency_key !== op.stripeIdempotencyKey) ||
      (!event.request.idempotency_key && (!op.stripeRequestId || event.request.id !== op.stripeRequestId)) ||
      event.createdAt.getTime() < Math.floor(op.firstAttemptAt!.getTime() / 1000) * 1000) return null
  const p = stripeTrialResponseProof(op, event.delivered, event.request.id)
  return p ? { ...p, evidence: "signed_event", eventId: event.eventId } : null
}

/** Tenant lock first. A changed subscription binding is allowed ONLY for proof-led
 * finalization, never dispatch. Validate the actual reservation, then fence the
 * immutable original binding. No journal identity is rewritten to today's binding. */
export async function assertStripeTrialFence(tx: Prisma.TransactionClient, profile: UserProfile,
  op: TenantTrialOperation, fence: OwnerBillingFence, now: Date): Promise<void> {
  assertStripeTrialIntent(op)
  assertBillingReservation(profile, fence)
  if (op.userId !== profile.userId || op.id !== fence.operationId || profile.stripeCustomerId !== op.stripeCustomerId) missing()
  await assertBillingFence(tx, { ...profile, stripeSubscriptionId: op.stripeSubscriptionId }, fence, now)
}

/** Expiry permits takeover of THIS operation only, never reservation release. */
export async function claimStripeTrialRecovery(tx: Prisma.TransactionClient, profile: UserProfile,
  op: TenantTrialOperation, now: Date): Promise<OwnerBillingFence | null> {
  assertStripeTrialIntent(op)
  if (profile.pendingTrialOperationId !== op.id || profile.pendingBillingMutationId !== null ||
      !["pending", "reconciliation_required"].includes(op.status)) missing()
  if (op.leaseExpiresAt && op.leaseExpiresAt > now) return null
  const fence: OwnerBillingFence = { kind: "owner", operationId: op.id, leaseOwner: randomUUID(), fencingToken: op.fencingToken + 1 }
  const changed = await tx.tenantTrialOperation.updateMany({ where: { id: op.id, userId: op.userId,
    fencingToken: op.fencingToken, status: op.status, leaseOwner: op.leaseOwner, leaseExpiresAt: op.leaseExpiresAt }, data: {
    status: "pending", leaseOwner: fence.leaseOwner, fencingToken: fence.fencingToken,
    leaseExpiresAt: new Date(now.getTime() + STRIPE_TRIAL_LEASE_MS), lastAttemptAt: now, attempts: { increment: 1 },
  } })
  if (changed.count !== 1) missing()
  return fence
}

export type StripeTrialAuditContext = Omit<Extract<TrialAuditEventInput, { subtype: "trial_result" }>, "subtype" | "result" | "previous" | "after" | "occurredAt">

/** INTERNAL transaction seam; caller owns tenant lock (and webhook ledger claim).
 * Both original confirmation and recovery commit through the same finalizer.
 * No nested transaction, provider mutation, local max-expiry or fallback grant. */
export async function finalizeStripeTrialInTransaction(input: {
  tx: Prisma.TransactionClient; profile: UserProfile; op: TenantTrialOperation; fence: OwnerBillingFence;
  stripe: Stripe; proof: StripeTrialProof; audit: StripeTrialAuditContext; now: () => Date;
  allowSupersession?: boolean; eventCreatedAt?: Date;
}): Promise<StripeTrialExtensionOutcome> {
  const { tx, profile, op, fence, stripe, proof, audit, now } = input
  await assertStripeTrialFence(tx, profile, op, fence, now())
  if (!storedStripeTrialProof({ ...op, providerResult: JSON.parse(JSON.stringify(proof)) as Prisma.JsonObject })) return missing()
  const previousRisks = await tx.tenantBillingRisk.findMany({ where: { userId: op.userId } })
  const observed = await resolveTrialEligibility(stripe, { ...profile, pendingTrialOperationId: null }, now(),
    previousRisks.map((r) => ({ ...r, stripeInvoiceId: r.stripeInvoiceId! })) as TrialBillingRiskEvidence[])
  if (!observed.available || !profile.stripeSubscriptionId) throw new TrialPreviewError("trial_eligibility_unavailable", 503)
  const current = await retrieveSubscriptionWithLatestInvoice(stripe, profile.stripeSubscriptionId)
  const verified = reconcileStripeSubscription(current, { subscriptionId: profile.stripeSubscriptionId, binding: profile })
  if (verified.kind !== "current" || observed.billingStatus !== current.status || (observed.snapshot && (
    observed.snapshot.priceId !== verified.snapshot.priceId ||
    observed.snapshot.trialEndsAt?.getTime() !== verified.snapshot.trialEndsAt?.getTime()))) return missing()
  const projection = stripeSnapshotProfileData(verified.snapshot)
  const grant = await tx.tenantTrialGrant.findUnique({ where: { userId: op.userId } })
  const platformOwnerAccess = await readPlatformOwnerAccess(op.userId)
  const before = resolveEffectiveAccess({ platformOwnerAccess, profile, grant, billingRisks: previousRisks }, now())
  const afterProfile = { ...profile, ...projection, billingAccessVersion: profile.billingAccessVersion + 1 }
  const after = resolveEffectiveAccess({ platformOwnerAccess, profile: afterProfile, grant, billingRisks: observed.risks }, now())
  const confirmed = profile.stripeSubscriptionId === op.stripeSubscriptionId && observed.eligible &&
    observed.source === "stripe_trial" && supportedStripeTrial(current) && verified.snapshot.priceId === proof.priceId &&
    verified.snapshot.trialEndsAt?.getTime() === op.targetExpiresAt!.getTime()
  // Unsupported/missing provider evidence is not a newer outcome. A known
  // original effect plus verified divergent current truth is required to close.
  const superseded = input.allowSupersession === true && (
    profile.stripeSubscriptionId !== op.stripeSubscriptionId || verified.snapshot.status !== "trialing" ||
    verified.snapshot.priceId !== proof.priceId ||
    (verified.snapshot.trialEndsAt !== null && verified.snapshot.trialEndsAt.getTime() !== op.targetExpiresAt!.getTime()) ||
    current.cancel_at_period_end === true || current.cancel_at != null || current.schedule != null ||
    current.pending_update != null || current.pause_collection != null || observed.risks.some((r) => r.blocking))
  const terminal = confirmed || superseded
  const result: StripeTrialExtensionOutcome = confirmed ? {
    operationId: op.id, action: "extend_or_grant", source: "stripe_trial", status: "succeeded",
    targetPlan: op.targetPlan!, targetExpiresAt: op.targetExpiresAt!.toISOString(), version: afterProfile.billingAccessVersion,
    notificationStatus: op.notify ? "pending" : "not_requested", after: safeTrialAccessSnapshot(after, afterProfile),
  } : terminal ? {
    operationId: op.id, source: "stripe_trial", status: "superseded", version: afterProfile.billingAccessVersion,
    notificationStatus: "not_requested", after: safeTrialAccessSnapshot(after, afterProfile),
  } : trialPending(op.id)
  await assertStripeTrialFence(tx, profile, op, fence, now())
  for (const risk of observed.risks) await tx.tenantBillingRisk.upsert({
    where: { kind_stripeObjectId: { kind: risk.kind, stripeObjectId: risk.stripeObjectId } },
    create: { ...risk, userId: op.userId, reconciledAt: now() },
    update: { stripeStatus: risk.stripeStatus, blocking: risk.blocking, reconciledAt: now() },
  })
  await writeTrialAuditEvent(tx, { ...audit, occurredAt: now(), previous: trialOperationAuditSnapshot(before, profile),
    after: trialOperationAuditSnapshot(after, afterProfile), subtype: "trial_result",
    result: { status: confirmed ? "succeeded" : terminal ? "superseded" : "reconciliation_required" } })
  await assertStripeTrialFence(tx, profile, op, fence, now())
  if (terminal) {
    await tx.tenantTrialNotification.updateMany({ where: { userId: op.userId, sentAt: null,
      status: { in: ["pending", "failed", "blocked"] }, operation: { status: "succeeded" } }, data: { status: "superseded" } })
    if (confirmed && op.notify) await tx.tenantTrialNotification.create({ data: {
      userId: op.userId, operationId: op.id, status: "pending", providerIdempotencyKey: `trial-access/${op.id}`,
    } })
  }
  // Owner schema has no superseded enum. A proven completed operation is terminal
  // succeeded, with the immutable safe RESULT explicitly reporting supersession.
  await tx.tenantTrialOperation.update({ where: { id: op.id }, data: {
    status: terminal ? "succeeded" : "reconciliation_required", providerResult: json(proof), stripeRequestId: proof.requestId,
    ...(terminal ? { result: json(result), completedAt: now(), leaseOwner: null, leaseExpiresAt: null, failureCode: null } : {}),
  } })
  await tx.userProfile.update({ where: { userId: op.userId }, data: { ...projection, billingAccessVersion: { increment: 1 },
    ...(input.eventCreatedAt && (!profile.latestStripeEventCreatedAt || input.eventCreatedAt > profile.latestStripeEventCreatedAt)
      ? { latestStripeEventCreatedAt: input.eventCreatedAt } : {}),
    ...(terminal ? { pendingTrialOperationId: null } : {}) } })
  return result
}