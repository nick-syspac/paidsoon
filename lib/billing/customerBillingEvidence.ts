import "server-only"
import type Stripe from "stripe"
import { TenantBillingConflictError } from "@/lib/billing/tenantBillingFence"
import { readFrozenBillingPlan } from "@/lib/billing/customerBillingPlan"
import { stripeObjectId } from "@/lib/billing/stripeSubscriptions"
import type { TenantBillingMutation, TenantBillingMutationStep } from "@/lib/generated/prisma/client"

const unknown = (): never => { throw new TenantBillingConflictError("billing_outcome_unknown") }
const options: Stripe.RequestOptions = { maxNetworkRetries: 0 }

/** Bounded, exhaustive enumeration, not search-index evidence or list-absence proof.
 * Hitting the budget, repeated pages, duplicates or ambiguity leaves the result unknown.
 * No status filter: completed/expired/released objects must not disappear from discovery.
 */
async function unique<T extends { id: string }>(
  list: (cursor?: string) => Promise<{ data: T[]; has_more: boolean }>, match: (row: T) => boolean,
): Promise<T | undefined> {
  const seen = new Set<string>()
  let cursor: string | undefined, found: T | undefined
  for (let page = 0; page < 100; page++) {
    const result = await list(cursor)
    for (const row of result.data) {
      if (seen.has(row.id)) return unknown()
      seen.add(row.id)
      if (match(row)) { if (found) return unknown(); found = row }
    }
    if (!result.has_more) return found
    cursor = result.data.at(-1)?.id
    if (!cursor) return unknown()
  }
  return unknown()
}

/** Read-only candidates still pass the SAME action verifier and fenced result commit as keyed responses. */
export async function retrieveCustomerBillingEvidence(
  stripe: Stripe, operation: TenantBillingMutation, step: TenantBillingMutationStep,
): Promise<unknown | undefined> {
  const correlated = (row: { metadata: Stripe.Metadata | null }): boolean =>
    row.metadata?.userId === operation.userId && row.metadata?.operationId === operation.id &&
    (!row.metadata.user_id || row.metadata.user_id === operation.userId)
  if (step.stepKey === "customer_create") {
    if (step.stripeCustomerId) return stripe.customers.retrieve(step.stripeCustomerId, {}, options)
    // Frozen customer_create never sets test_clock. The default list covers that exact population.
    // No email filter: changed email is neither identity nor evidence of nonexecution.
    return unique<Stripe.Customer>((cursor) => stripe.customers.list({ limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, options), correlated)
  }
  const plan = readFrozenBillingPlan(operation.normalizedInput)
  if (step.stepKey === "checkout_create") {
    if (step.stripeSessionId || operation.stripeSessionId) {
      return stripe.checkout.sessions.retrieve((step.stripeSessionId ?? operation.stripeSessionId)!, { expand: ["line_items"] }, options)
    }
    if (!operation.stripeCustomerId) return unknown()
    return unique<Stripe.Checkout.Session>((cursor) => stripe.checkout.sessions.list({ customer: operation.stripeCustomerId!, limit: 100,
      ...(cursor ? { starting_after: cursor } : {}) }, options), correlated)
  }
  // There is deliberately no invented portal retrieve/list API. Only durable verified
  // step proof (handled by the coordinator) or retained-key replay can recover it.
  if (step.stepKey === "portal_create" || step.stepKey === "cancel_portal_create") return undefined
  if (step.stepKey === "upgrade") {
    if (!plan.subscriptionId) return unknown()
    const subscription = await stripe.subscriptions.retrieve(plan.subscriptionId, { expand: ["latest_invoice"] }, options)
    // A requested current price alone does not attribute the update to this operation.
    return correlated(subscription) ? subscription : undefined
  }
  const scheduleId = step.stripeScheduleId ?? operation.stripeScheduleId ??
    (step.stepKey === "schedule_release" ? plan.scheduleId : /^\/v1\/subscription_schedules\/([^/]+)$/.exec(step.objectTarget)?.[1])
  if (scheduleId) {
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, {}, options)
    // Release is attributable to the frozen, uniquely bound schedule target and its released_subscription.
    if (step.stepKey === "schedule_release") return schedule.status === "released" ? schedule : undefined
    if (step.stepKey === "schedule_phase_update") return correlated(schedule) ? schedule : undefined
    return schedule
  }
  if (!operation.stripeCustomerId) return unknown()
  // from_subscription creation cannot set metadata in the pinned API. A merely
  // unique schedule for that subscription is NOT attributable creation evidence.
  // Correlation can exist if a later, durably keyed phase update already ran.
  return unique((cursor) => stripe.subscriptionSchedules.list({ customer: operation.stripeCustomerId!, limit: 100,
    ...(cursor ? { starting_after: cursor } : {}) }, options),
  (row) => correlated(row) && stripeObjectId(row.subscription) === plan.subscriptionId)
}