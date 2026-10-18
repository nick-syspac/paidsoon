import "server-only"
import type Stripe from "stripe"
import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma, UserProfile } from "@/lib/generated/prisma/client"
import { lockTenantBilling } from "@/lib/billing/tenantBillingLock"
import {
  assertWebhookClaim, finishWebhookEventInTransaction, type WebhookClaim,
} from "@/lib/billing/webhookLedger"
import {
  reconcileStripeSubscription, retrieveSubscriptionWithLatestInvoice,
  stripeObjectId, stripeSnapshotProfileData, StripeSnapshotError,
  type StripeBillingIdentity, type VerifiedStripeSnapshot,
} from "@/lib/billing/stripeSubscriptions"
import { normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { finalizeStripeTrialWebhookInTransaction } from "@/lib/billing/stripeTrialWebhook"
import type { StripeTrialEventEvidence } from "@/lib/billing/stripeTrialFinalization"
import { afterTrialAccessCommit } from "@/lib/email/trialAccessPostCommit"
import {
  assertBillingFence, assertBillingReservation, TenantBillingConflictError,
  type TenantBillingFence, type OwnerBillingFence,
} from "@/lib/billing/tenantBillingFence"

export { TenantBillingConflictError } from "@/lib/billing/tenantBillingFence"
export type TrialOperationFence = OwnerBillingFence
export type TenantBillingContext =
  | { kind: "webhook"; claim: WebhookClaim; eventCreatedAt?: Date; trialEvent?: StripeTrialEventEvidence }
  | { kind: "hosted_lifecycle" }
  | { kind: "direct"; expectedVersion?: number; operationFence?: TenantBillingFence }

type Projection = Partial<ReturnType<typeof stripeSnapshotProfileData>> & {
  pendingDowngradeTier?: null; stripeScheduleId?: null;
}
type PreparedBillingResult<T> = {
  result: T; projection?: Projection;
  persist?: (tx: Prisma.TransactionClient) => Promise<void | { projectionHandled: true }>;
  status?: "processed" | "skipped"; note?: string;
}

/**
 * Internal reconciliation primitive, shared with verified risk mapping. Intentional
 * system RLS bypass; callers must resolve tenant identity before entering. Lock
 * order: tenant -> operation/event fence. Provider observations MUST be made in
 * prepare, under this lock, never captured by a pre-lock write callback.
 *
 * This is not a customer-input patch API. Public direct callers use the narrow
 * subscription reader below, after any provider mutation OUTSIDE a transaction.
 */
export async function coordinateTenantBilling<T>(
  userId: string, context: TenantBillingContext,
  prepare: (tx: Prisma.TransactionClient, profile: UserProfile) => Promise<PreparedBillingResult<T>>,
): Promise<T> {
  return prismaAdmin.$transaction(async (tx) => {
    await lockTenantBilling(tx, userId)
    const profile = await tx.userProfile.findUnique({ where: { userId } })
    if (!profile) throw new TenantBillingConflictError("billing_profile_missing")
    if (context.kind === "direct") {
      assertBillingReservation(profile, context.operationFence)
      // A webhook may advance the projection version while this accepted customer
      // operation remains reserved. Its execution generation is not today's version.
      const version = context.operationFence?.kind === "customer"
        ? context.operationFence.executionVersion : profile.billingAccessVersion
      if (context.expectedVersion !== undefined && context.expectedVersion !== version) {
        throw new TenantBillingConflictError("billing_version_conflict")
      }
      if (context.operationFence) await assertBillingFence(tx, profile, context.operationFence)
    }
    const prepared = await prepare(tx, profile)
    // A claim can expire/be replaced DURING provider reads. Lock/fence it only
    // after those reads, then keep its row locked through the terminal commit.
    if (context.kind === "webhook") await assertWebhookClaim(tx, context.claim)
    else if (context.kind === "direct" && context.operationFence) await assertBillingFence(tx, profile, context.operationFence)
    const persisted = await prepared.persist?.(tx)
    if (!persisted?.projectionHandled && (prepared.projection || prepared.persist)) {
      const hint = context.kind === "webhook" ? context.eventCreatedAt : undefined
      await tx.userProfile.update({
        where: { userId }, data: {
          ...prepared.projection, billingAccessVersion: { increment: 1 },
          // Provider-event maximum is informational only. Direct writes NEVER
          // invent an event watermark, and no timestamp skips a current read.
          ...(hint && (!profile.latestStripeEventCreatedAt || hint > profile.latestStripeEventCreatedAt)
            ? { latestStripeEventCreatedAt: hint } : {}),
        },
      })
    }
    if (context.kind === "webhook") {
      await finishWebhookEventInTransaction(tx, context.claim, prepared.status ?? "processed", prepared.note)
    }
    return prepared.result
  }, { timeout: 20000 })
}

export type SubscriptionReconciliation =
  | { kind: "current"; snapshot: VerifiedStripeSnapshot }
  | { kind: "superseded" }

/** Fresh verified read on commit; accepts provider IDs, NEVER a caller's patch. */
export async function reconcileTenantSubscription(
  stripe: Stripe, userId: string, subscriptionId: string,
  context: TenantBillingContext, sources: StripeBillingIdentity[] = [],
): Promise<SubscriptionReconciliation> {
  let notificationOperationId: string | null = null
  const reconciled = await coordinateTenantBilling<SubscriptionReconciliation>(userId, context, async (_tx, profile) => {
    const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
    const result = reconcileStripeSubscription(subscription, { subscriptionId, sources, binding: profile })
    if (result.kind === "superseded") {
      // Identity verification above still applies to the obsolete object. Also
      // verify the bound object: a local ID alone is not evidence of supersession.
      const current = await retrieveSubscriptionWithLatestInvoice(stripe, profile.stripeSubscriptionId!)
      reconcileStripeSubscription(current, { subscriptionId: profile.stripeSubscriptionId!, binding: profile })
      return { result, status: "skipped", note: "superseded_subscription",
        ...(context.kind === "webhook" && context.trialEvent && profile.pendingTrialOperationId ? {
          persist: async (tx: Prisma.TransactionClient) => {
            if (await finalizeStripeTrialWebhookInTransaction(tx, profile, stripe, context.trialEvent!)) {
              notificationOperationId = profile.pendingTrialOperationId
              return { projectionHandled: true as const }
            }
          },
        } : {}) }
    }
    const scheduleExecuted = profile.pendingDowngradeTier !== null &&
      result.snapshot.tier === normalizeSubscriptionTier(profile.pendingDowngradeTier)
    return {
      result, projection: {
        ...stripeSnapshotProfileData(result.snapshot),
        ...(scheduleExecuted ? { pendingDowngradeTier: null, stripeScheduleId: null } : {}),
      },
      ...(context.kind === "webhook" && context.trialEvent && profile.pendingTrialOperationId ? {
        persist: async (tx: Prisma.TransactionClient) => {
          if (await finalizeStripeTrialWebhookInTransaction(tx, profile, stripe, context.trialEvent!)) {
            notificationOperationId = profile.pendingTrialOperationId
            return { projectionHandled: true as const }
          }
        },
      } : {}),
    }
  })
  // Only after the OUTER coordinator/ledger transaction resolves. Delivery
  // independently verifies confirmed/requested access; errors cannot fail the
  // successful webhook or reopen its ledger/access operation.
  if (notificationOperationId) await afterTrialAccessCommit(userId, {
    operationId: notificationOperationId, status: "succeeded", notificationStatus: "pending",
  }, { ipAddress: "", userAgent: "stripe-webhook", requestId: context.kind === "webhook" ? context.claim.stripeEventId : "billing-reconciliation" })
  return reconciled
}

/** Schedule events cannot clear a newer schedule/binding using delivered fields. */
export async function reconcileTenantScheduleRelease(
  stripe: Stripe, userId: string, scheduleId: string, context: TenantBillingContext,
): Promise<void> {
  return coordinateTenantBilling(userId, context, async (_tx, profile) => {
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId)
    if (schedule.id !== scheduleId || stripeObjectId(schedule.customer) !== profile.stripeCustomerId) {
      throw new StripeSnapshotError("conflicting_stripe_schedule")
    }
    if (profile.stripeScheduleId !== scheduleId || schedule.status !== "released") {
      return { result: undefined, status: "skipped", note: "superseded_schedule" }
    }
    const subscriptionId = stripeObjectId(schedule.released_subscription)
    if (!subscriptionId || subscriptionId !== profile.stripeSubscriptionId) {
      throw new StripeSnapshotError("conflicting_stripe_subscription")
    }
    const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
    const verified = reconcileStripeSubscription(subscription, { subscriptionId, binding: profile, sources: [schedule] })
    if (verified.kind !== "current" || stripeObjectId(subscription.schedule) === scheduleId) {
      throw new StripeSnapshotError("stripe_state_changed")
    }
    return { result: undefined, projection: {
      ...stripeSnapshotProfileData(verified.snapshot), pendingDowngradeTier: null, stripeScheduleId: null,
    } }
  })
}