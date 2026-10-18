import "server-only"
import type Stripe from "stripe"
import { z } from "zod"
import type { Prisma, UserProfile } from "@/lib/generated/prisma/client"
import { coordinateTenantBilling, type TenantBillingContext, type SubscriptionReconciliation } from "@/lib/billing/tenantBillingCoordinator"
import {
  reconcileStripeSubscription, retrieveSubscriptionWithLatestInvoice, stripeObjectId,
  stripeSnapshotProfileData, stripeTimestamp, StripeSnapshotError,
} from "@/lib/billing/stripeSubscriptions"

export type HostedCheckoutContext = Extract<TenantBillingContext, { kind: "webhook" | "hosted_lifecycle" }>
const conflict = (): never => { throw new StripeSnapshotError("hosted_checkout_evidence_conflict") }
const ended = (subscription: Stripe.Subscription): boolean =>
  ["canceled", "incomplete_expired"].includes(subscription.status)

function tenantMetadata(metadata: Stripe.Metadata | null | undefined, userId: string): void {
  if ((metadata?.userId && metadata.userId !== userId) ||
      (metadata?.user_id && metadata.user_id !== userId)) conflict()
}

/** A bounded exhaustive read. Truncation/duplicate pages are uncertainty, never absence proof. */
async function allSubscriptions(stripe: Stripe, customer: string): Promise<Stripe.Subscription[]> {
  const found = new Map<string, Stripe.Subscription>()
  let cursor: string | undefined
  for (let page = 0; page < 100; page++) {
    const result = await stripe.subscriptions.list({ customer, status: "all", limit: 100,
      ...(cursor ? { starting_after: cursor } : {}) })
    for (const subscription of result.data) {
      if (found.has(subscription.id) || stripeObjectId(subscription.customer) !== customer) conflict()
      found.set(subscription.id, subscription)
    }
    if (!result.has_more) return [...found.values()]
    cursor = result.data.at(-1)?.id
    if (!cursor) conflict()
  }
  return conflict()
}

/** Journal correlation is evidence, NOT an execution fence or permission to finalize creation. */
async function verifyGeneration(
  tx: Prisma.TransactionClient, profile: UserProfile, session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription,
): Promise<string | null | undefined> {
  const operationId = session.metadata?.operationId
  if (!operationId) {
    // Pre-deployment sessions use the existing customer/tenant binding only.
    // A subscription with journal metadata cannot be laundered as legacy.
    if (subscription.metadata?.operationId) conflict()
    return undefined
  }
  if (!z.uuid().safeParse(operationId).success || subscription.metadata?.operationId !== operationId) conflict()
  const operation = await tx.tenantBillingMutation.findUnique({ where: { id: operationId } })
  const starting = z.object({ stripeCustomerId: z.string().nullable(), stripeSubscriptionId: z.string().nullable() })
    .safeParse(operation?.startingBinding)
  if (!operation || operation.userId !== profile.userId || operation.actorUserId !== profile.userId ||
      operation.action !== "checkout_create" || operation.parentMutationId || !starting.success ||
      !["pending", "reconciliation_required", "succeeded"].includes(operation.status) ||
      operation.executionVersion === null || operation.startingVersion >= operation.executionVersion ||
      operation.executionVersion > profile.billingAccessVersion || operation.stripeCustomerId !== profile.stripeCustomerId ||
      operation.stripeSubscriptionId !== starting.data.stripeSubscriptionId ||
      (starting.data.stripeCustomerId !== null && starting.data.stripeCustomerId !== profile.stripeCustomerId) ||
      (operation.stripeSessionId && operation.stripeSessionId !== session.id)) return conflict()
  const step = await tx.tenantBillingMutationStep.findUnique({
    where: { userId_mutationId_stepKey: { userId: profile.userId, mutationId: operationId, stepKey: "checkout_create" } },
  })
  const request = z.object({ customer: z.string(), mode: z.literal("subscription"),
    metadata: z.object({ userId: z.string(), operationId: z.string() }),
    subscription_data: z.object({ metadata: z.object({ userId: z.string(), operationId: z.string() }) }),
  }).safeParse(step?.normalizedRequest)
  if (!step || step.userId !== profile.userId || step.mutationId !== operationId || !step.firstAttemptAt ||
      session.created < Math.floor(step.firstAttemptAt.getTime() / 1000) ||
      step.status === "failed" || (step.stripeSessionId && step.stripeSessionId !== session.id) || !request.success ||
      request.data.customer !== profile.stripeCustomerId || request.data.metadata.userId !== profile.userId ||
      request.data.metadata.operationId !== operationId || request.data.subscription_data.metadata.userId !== profile.userId ||
      request.data.subscription_data.metadata.operationId !== operationId) return conflict()
  return starting.data.stripeSubscriptionId
}

/**
 * Narrow privileged hosted-lifecycle exception. Authenticated callers first read
 * ownership with RLS; webhook callers first verify signature and claim delivery.
 * Every provider observation is repeated under the shared tenant lock. No provider
 * mutations, grant/risk writes, operation writes, reservation release or owner target.
 */
export async function reconcileHostedCheckout(
  stripe: Stripe, userId: string, sessionId: string, context: HostedCheckoutContext,
): Promise<SubscriptionReconciliation | { kind: "incomplete" }> {
  return coordinateTenantBilling<SubscriptionReconciliation | { kind: "incomplete" }>(userId, context, async (tx, profile) => {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.id !== sessionId || !profile.stripeCustomerId ||
        stripeObjectId(session.customer) !== profile.stripeCustomerId) return conflict()
    tenantMetadata(session.metadata, userId)
    const customer = await stripe.customers.retrieve(profile.stripeCustomerId)
    if (customer.deleted || customer.id !== profile.stripeCustomerId) return conflict()
    tenantMetadata(customer.metadata, userId)
    if (await tx.userProfile.findFirst({ where: { stripeCustomerId: customer.id, NOT: { userId } } })) return conflict()
    if (session.mode !== "subscription") return conflict()
    if (session.status !== "complete") return {
      result: { kind: "incomplete" as const }, status: "skipped", note: "checkout_not_complete",
    }
    const subscriptionId = stripeObjectId(session.subscription)
    if (!subscriptionId) return conflict()
    const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
    tenantMetadata(subscription.metadata, userId)
    stripeTimestamp(session.created)
    stripeTimestamp(subscription.trial_start)
    // Trial evidence is provider-owned: a completed free trial is not paid access.
    if (session.payment_status !== "paid" && !(session.payment_status === "no_payment_required" &&
        subscription.trial_start != null && subscription.trial_end != null &&
        subscription.trial_end > subscription.trial_start && session.created <= subscription.trial_start &&
        session.created < subscription.trial_end)) return conflict()
    const startingSubscription = await verifyGeneration(tx, profile, session, subscription)
    // Verify the candidate fully even if the current binding will supersede it.
    const candidate = reconcileStripeSubscription(subscription, {
      subscriptionId, binding: { ...profile, stripeSubscriptionId: null }, sources: [session],
    })
    if (candidate.kind !== "current") return conflict()
    const others = await allSubscriptions(stripe, customer.id)
    const current = new Map<string, Stripe.Subscription>([[subscriptionId, subscription]])
    // Retrieve every enumerated subscription, not the first entry or a delivered
    // status hint. Even an ended list row cannot hide a currently live object.
    for (const other of others) {
      tenantMetadata(other.metadata, userId)
      if (!current.has(other.id)) {
        current.set(other.id, await retrieveSubscriptionWithLatestInvoice(stripe, other.id))
      }
    }
    if (profile.stripeSubscriptionId && !current.has(profile.stripeSubscriptionId)) {
      current.set(profile.stripeSubscriptionId, await retrieveSubscriptionWithLatestInvoice(stripe, profile.stripeSubscriptionId))
    }
    for (const [id, value] of current) {
      reconcileStripeSubscription(value, { subscriptionId: id, binding: { ...profile, stripeSubscriptionId: null } })
    }
    const live = [...current.values()].filter((value) => !ended(value))
    if (live.length > 1) return conflict()
    const bound = profile.stripeSubscriptionId ? current.get(profile.stripeSubscriptionId) : undefined
    if (bound && bound.id !== subscriptionId) {
      if (ended(subscription) && !ended(bound) && live[0]?.id === bound.id) return {
        result: { kind: "superseded" as const }, status: "skipped", note: "superseded_checkout_subscription",
      }
      // Metadata alone cannot overwrite a different binding. Only the recorded
      // starting binding can justify replacing a verified ended subscription.
      if (!ended(bound) || startingSubscription !== bound.id) return conflict()
    } else if (!bound && startingSubscription !== undefined && startingSubscription !== null) return conflict()
    if (live.some((value) => value.id !== subscriptionId)) return conflict()
    const projection = stripeSnapshotProfileData(candidate.snapshot)
    // Same-session replay still verifies provider truth, but does not stale previews
    // when nothing changed. No new lifecycle journal or fabricated operation needed.
    const changed = Object.entries(projection).some(([key, value]) => {
      const previous = profile[key as keyof UserProfile]
      return value instanceof Date ? !(previous instanceof Date) || +previous !== +value : previous !== value
    })
    return { result: candidate, ...(changed ? { projection } : {}) }
  })
}