import { createHash } from "node:crypto"
import type Stripe from "stripe"
import {
  reconcileStripeSubscription,
  retrieveSubscriptionWithLatestInvoice,
  stripeObjectId,
  stripeTierForPrice,
  stripeTimestamp,
  StripeSnapshotError,
  type StripeBillingBinding,
  type VerifiedStripeSnapshot,
} from "@/lib/billing/stripeSubscriptions"

/** Server-only evidence, not a client response or a persistence command. */
export interface TrialBillingRiskEvidence {
  kind: "subscription_invoice" | "subscription_dispute"
  stripeObjectId: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  stripeInvoiceId: string
  stripeChargeId: string | null
  stripeStatus: string
  blocking: boolean
}

export interface TrialEligibilityProfile extends StripeBillingBinding {
  subscriptionStatus: string | null
  billingAccessVersion: number
  pendingTrialOperationId: string | null
}

export interface TrialEligibility {
  available: boolean
  eligible: boolean
  source: "stripe_trial" | "admin_grant" | null
  restrictions: string[]
  resolution: "billing_portal_or_support" | null
  snapshot: VerifiedStripeSnapshot | null
  /** Fresh bound/live subscription status, including eligible canceled/paused sources. */
  billingStatus: string | null
  risks: TrialBillingRiskEvidence[]
  /** Null on incomplete/unreadable evidence; never usable as a valid preview. */
  fingerprint: string | null
}

function requireFact(condition: unknown, code: string): asserts condition {
  if (!condition) throw new StripeSnapshotError(code)
}

function id(value: unknown): string {
  const result = stripeObjectId(value)
  requireFact(result && result === result.trim(), "invalid_stripe_id")
  return result
}

function identity(
  object: { customer?: unknown; metadata?: Stripe.Metadata | null },
  profile: TrialEligibilityProfile,
  requireCustomer = true,
): void {
  if (requireCustomer) requireFact(id(object.customer) === profile.stripeCustomerId, "conflicting_stripe_customer")
  for (const key of ["userId", "user_id"]) {
    const hint = object.metadata?.[key]
    requireFact(hint == null || hint === "" || hint === profile.userId, "conflicting_stripe_metadata")
  }
}

/** Explicit pagination also rejects stalled/malformed pages rather than silently truncating. */
async function all<T extends { id: string }>(
  read: (cursor?: string) => PromiseLike<Stripe.ApiList<T>>,
): Promise<T[]> {
  const records: T[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const page = await read(cursor)
    requireFact(Array.isArray(page.data) && typeof page.has_more === "boolean", "invalid_stripe_page")
    for (const record of page.data) {
      const recordId = id(record)
      requireFact(!seen.has(recordId), "ambiguous_stripe_page")
      seen.add(recordId)
      records.push(record)
    }
    if (!page.has_more) return records
    requireFact(page.data.length > 0, "incomplete_stripe_page")
    cursor = id(page.data[page.data.length - 1])
  }
}

const statuses = ["active", "trialing", "past_due", "unpaid", "incomplete", "incomplete_expired", "canceled", "paused"]
const blockingStatuses = ["active", "past_due", "unpaid", "incomplete", "incomplete_expired"]
const blockingDisputes = ["warning_needs_response", "warning_under_review", "needs_response", "under_review", "lost"]
const clearDisputes = ["won", "warning_closed", "prevented"]

export function trialDisputeIsBlocking(status: string): boolean {
  requireFact([...blockingDisputes, ...clearDisputes].includes(status), "unknown_dispute_status")
  return blockingDisputes.includes(status)
}

// Shared read-only evidence contracts for focused signed-event reconciliation.
export {
  all as readAllStripePages,
  id as requireStripeId,
  identity as verifyTrialBillingIdentity,
  invoiceSubscription as trialInvoiceSubscription,
  invoiceRisk as trialInvoiceRisk,
}

function subscriptionEvidence(subscription: Stripe.Subscription, profile: TrialEligibilityProfile): object {
  id(subscription)
  identity(subscription, profile)
  requireFact(statuses.includes(subscription.status), "unknown_subscription_status")
  requireFact(subscription.items && !subscription.items.has_more && subscription.items.data.length === 1, "unsupported_stripe_items")
  const item = subscription.items.data[0]
  stripeTierForPrice(id(item.price))
  requireFact(typeof subscription.cancel_at_period_end === "boolean", "invalid_stripe_lifecycle")
  stripeTimestamp(subscription.cancel_at)
  stripeTimestamp(subscription.trial_end)
  return {
    id: subscription.id, customer: id(subscription.customer), status: subscription.status,
    metadata: { userId: subscription.metadata?.userId ?? null, user_id: subscription.metadata?.user_id ?? null },
    price: id(item.price), quantity: item.quantity ?? null, recurring: item.price.recurring ?? null,
    trial_end: subscription.trial_end, trial_start: subscription.trial_start,
    billing_cycle_anchor: subscription.billing_cycle_anchor,
    cancel_at: subscription.cancel_at, cancel_at_period_end: subscription.cancel_at_period_end,
    schedule: stripeObjectId(subscription.schedule), pending_update: subscription.pending_update,
    pause_collection: subscription.pause_collection,
    pending_invoice_item_interval: subscription.pending_invoice_item_interval,
    next_pending_invoice_item_invoice: subscription.next_pending_invoice_item_invoice,
    latest_invoice: stripeObjectId(subscription.latest_invoice),
  }
}

function suitableTrial(subscription: Stripe.Subscription): boolean {
  const item = subscription.items.data[0]
  const recurring = item.price.recurring
  return subscription.schedule === null && subscription.cancel_at === null &&
    subscription.cancel_at_period_end === false && subscription.pending_update === null &&
    subscription.pause_collection === null && subscription.pending_invoice_item_interval === null &&
    subscription.next_pending_invoice_item_invoice === null && item.quantity === 1 &&
    recurring?.usage_type === "licensed" && item.price.type === "recurring" &&
    stripeTimestamp(subscription.trial_end) !== null &&
    stripeTimestamp(subscription.billing_cycle_anchor) !== null
}

function invoiceSubscription(invoice: Stripe.Invoice, profile: TrialEligibilityProfile): string | null {
  id(invoice)
  identity(invoice, profile)
  if (invoice.parent?.type === "subscription_details") {
    const details = invoice.parent.subscription_details
    requireFact(details, "unknown_invoice_mapping")
    identity({ metadata: details.metadata }, profile, false)
    return id(details.subscription)
  }
  // A null parent AND explicit manual billing reason proves a platform one-time invoice.
  requireFact(invoice.parent === null && invoice.billing_reason === "manual", "unknown_invoice_mapping")
  return null
}

function invoiceRisk(
  invoice: Stripe.Invoice,
  subscriptionId: string,
  customerId: string,
  now: Date,
  previous: readonly TrialBillingRiskEvidence[],
): TrialBillingRiskEvidence {
  requireFact(["draft", "open", "paid", "void", "uncollectible"].includes(invoice.status ?? ""), "unknown_invoice_status")
  requireFact(Number.isSafeInteger(invoice.amount_remaining) && invoice.amount_remaining >= 0 &&
    Number.isSafeInteger(invoice.attempt_count) && invoice.attempt_count >= 0, "unknown_invoice_debt")
  const due = stripeTimestamp(invoice.due_date)
  const retained = previous.some((risk) => risk.kind === "subscription_invoice" && risk.stripeObjectId === invoice.id && risk.blocking)
  const blocking = invoice.status === "uncollectible" || (invoice.status === "open" &&
    (retained || (invoice.amount_remaining > 0 && (invoice.attempt_count > 0 || (due !== null && due <= now)))))
  // Only paid/void clear a previously blocking fact; draft is safe only for new facts.
  requireFact(!retained || invoice.status !== "draft", "unresolved_invoice_evidence")
  return {
    kind: "subscription_invoice", stripeObjectId: invoice.id, stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId, stripeInvoiceId: invoice.id, stripeChargeId: null,
    stripeStatus: invoice.status!, blocking,
  }
}

function canonical(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`
}

/**
 * Fresh platform-account reads ONLY. No request options/stripeAccount, persistence,
 * sends, customer creation, subscription updates or automatic grant fallback.
 * The caller must authenticate/scope the profile and recheck under its later journal lock.
 */
export async function resolveTrialEligibility(
  stripe: Stripe | null,
  profile: TrialEligibilityProfile,
  now: Date,
  previousRisks: readonly TrialBillingRiskEvidence[] = [],
): Promise<TrialEligibility> {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Trial eligibility requires an explicit valid now")
  const result: TrialEligibility = {
    available: false, eligible: false, source: null, restrictions: [],
    resolution: "billing_portal_or_support", snapshot: null, billingStatus: profile.subscriptionStatus,
    risks: [], fingerprint: null,
  }
  const restrictions = new Set<string>()
  const facts: object[] = []
  try {
    requireFact(profile.userId.trim() && Number.isSafeInteger(profile.billingAccessVersion) && profile.billingAccessVersion >= 0, "invalid_billing_binding")
    for (const previous of previousRisks) {
      requireFact(typeof previous.blocking === "boolean" && (
        previous.kind === "subscription_invoice"
          ? ["draft", "open", "paid", "void", "uncollectible"].includes(previous.stripeStatus)
          : previous.kind === "subscription_dispute" && [...blockingDisputes, ...clearDisputes].includes(previous.stripeStatus)
      ), "unknown_previous_risk")
    }
    if (profile.pendingTrialOperationId) restrictions.add("trial_operation_in_progress")
    if (!profile.stripeCustomerId) {
      requireFact(!profile.stripeSubscriptionId && previousRisks.length === 0, "missing_stripe_customer_binding")
      const localStatus = profile.subscriptionStatus
      if (!["trialing", "canceled", "cancelled", "paused"].includes(localStatus ?? "")) {
        restrictions.add(blockingStatuses.includes(localStatus ?? "") ? `local_${localStatus}` : "unknown_subscription_status")
      }
    } else {
      requireFact(stripe, "provider_unavailable")
      id(profile.stripeCustomerId)
      const customer = await stripe.customers.retrieve(profile.stripeCustomerId)
      requireFact(!customer.deleted && id(customer) === profile.stripeCustomerId, "invalid_stripe_customer")
      identity(customer, profile, false)
      facts.push({ customer: customer.id, metadata: { userId: customer.metadata.userId ?? null, user_id: customer.metadata.user_id ?? null } })
      const subscriptions = await all((cursor) => stripe.subscriptions.list({
        customer: customer.id, status: "all", limit: 100, ...(cursor ? { starting_after: cursor } : {}),
      }))
      const subscriptionIds = new Set(subscriptions.map((subscription) => id(subscription)))
      requireFact(!profile.stripeSubscriptionId || subscriptionIds.has(id(profile.stripeSubscriptionId)), "missing_linked_subscription")
      const live = subscriptions.filter((subscription) => subscription.status !== "canceled")
      if (live.length > 1) restrictions.add("multiple_live_subscriptions")
      requireFact(live.length !== 1 || !profile.stripeSubscriptionId || live[0].id === profile.stripeSubscriptionId, "ambiguous_subscription_binding")
      const bound = subscriptions.find((subscription) => subscription.id === profile.stripeSubscriptionId)
      result.billingStatus = bound?.status ?? (live.length === 1 ? live[0].status : profile.subscriptionStatus)
      for (const subscription of subscriptions) {
        facts.push(subscriptionEvidence(subscription, profile))
        if (blockingStatuses.includes(subscription.status)) restrictions.add(`subscription_${subscription.status}`)
      }
      const candidate = subscriptions.find((subscription) => subscription.status === "trialing")
      let candidateInvoice: Stripe.Invoice | null = null
      if (candidate) {
        requireFact(!profile.stripeSubscriptionId || candidate.id === profile.stripeSubscriptionId, "ambiguous_subscription_binding")
        const current = await retrieveSubscriptionWithLatestInvoice(stripe, candidate.id)
        // Validate both reads: an unsafe list result cannot be hidden by a later safe read.
        facts.push(subscriptionEvidence(current, profile))
        requireFact(current.status === candidate.status && canonical(subscriptionEvidence(current, profile)) === canonical(subscriptionEvidence(candidate, profile)), "stripe_state_changed")
        const reconciled = reconcileStripeSubscription(current, { subscriptionId: candidate.id, binding: profile, sources: [customer, candidate] })
        requireFact(reconciled.kind === "current", "ambiguous_subscription_binding")
        result.snapshot = reconciled.snapshot
        requireFact(typeof current.latest_invoice !== "string", "stripe_invoice_not_expanded")
        candidateInvoice = current.latest_invoice
        facts.push({ snapshot: result.snapshot })
        if (!suitableTrial(candidate) || !suitableTrial(current)) restrictions.add("unsupported_stripe_trial")
      }
      if (subscriptions.length === 0 && !["trialing", "canceled", "cancelled", "paused"].includes(profile.subscriptionStatus ?? "")) {
        restrictions.add("unverified_local_billing_status")
      }

      const invoices = await all((cursor) => stripe.invoices.list({ customer: customer.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }))
      // Include the expanded authoritative latest invoice even if a concurrent list omitted it.
      if (candidateInvoice) {
        const latest = candidateInvoice
        const index = invoices.findIndex((invoice) => invoice.id === latest.id)
        if (index >= 0) {
          const listed = invoices[index]
          requireFact(listed.status === latest.status && listed.amount_remaining === latest.amount_remaining &&
            listed.attempt_count === latest.attempt_count && listed.due_date === latest.due_date &&
            invoiceSubscription(listed, profile) === invoiceSubscription(latest, profile), "stripe_state_changed")
          invoices[index] = latest
        } else invoices.push(latest)
      }
      const invoiceMap = new Map<string, { invoice: Stripe.Invoice; subscription: string | null }>()
      const chargeInvoices = new Map<string, Set<string>>()
      const intentInvoices = new Map<string, Set<string>>()
      function associate(map: Map<string, Set<string>>, key: string, invoiceId: string): void {
        const entries = map.get(key) ?? new Set<string>()
        entries.add(invoiceId)
        map.set(key, entries)
      }
      for (const invoice of invoices) {
        const subscription = invoiceSubscription(invoice, profile)
        requireFact(!subscription || subscriptionIds.has(subscription), "unknown_invoice_subscription")
        invoiceMap.set(invoice.id, { invoice, subscription })
        facts.push({ invoice: invoice.id, subscription, status: invoice.status, remaining: invoice.amount_remaining,
          attempts: invoice.attempt_count, due: invoice.due_date })
        if (subscription) result.risks.push(invoiceRisk(invoice, subscription, customer.id, now, previousRisks))
        const payments = await all((cursor) => stripe.invoicePayments.list({ invoice: invoice.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }))
        for (const payment of payments) {
          requireFact(id(payment.invoice) === invoice.id, "conflicting_invoice_payment")
          facts.push({ payment: payment.id, invoice: invoice.id, mapping: payment.payment, status: payment.status })
          if (payment.payment.type === "charge") associate(chargeInvoices, id(payment.payment.charge), invoice.id)
          else if (payment.payment.type === "payment_intent") associate(intentInvoices, id(payment.payment.payment_intent), invoice.id)
          else requireFact(payment.payment.type === "payment_record" && stripeObjectId(payment.payment.payment_record), "unknown_invoice_payment")
        }
      }
      const charges = await all((cursor) => stripe.charges.list({ customer: customer.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }))
      for (const charge of charges) {
        identity(charge, profile)
        const intent = stripeObjectId(charge.payment_intent)
        const mapped = new Set([...(chargeInvoices.get(charge.id) ?? []), ...(intent ? intentInvoices.get(intent) ?? [] : [])])
        const connect = Boolean(stripeObjectId(charge.on_behalf_of) || stripeObjectId(charge.transfer_data?.destination) || stripeObjectId(charge.source_transfer))
        // Reverse lookup is required before calling an unmapped PaymentIntent a one-time payment.
        // Verified Connect provenance needs no further debtor-payment investigation.
        if (intent && !connect) {
          const payments = await all((cursor) => stripe.invoicePayments.list({
            payment: { type: "payment_intent", payment_intent: intent }, limit: 100,
            ...(cursor ? { starting_after: cursor } : {}),
          }))
          for (const payment of payments) {
            requireFact(payment.payment.type === "payment_intent" && id(payment.payment.payment_intent) === intent, "conflicting_invoice_payment")
            const invoiceId = id(payment.invoice)
            requireFact(invoiceMap.has(invoiceId), "unknown_charge_invoice")
            mapped.add(invoiceId)
          }
        }
        const relevant = [...mapped].flatMap((invoiceId) => {
          const entry = invoiceMap.get(invoiceId)
          requireFact(entry, "unknown_charge_invoice")
          return entry.subscription ? [entry] : []
        })
        for (const key of ["subscriptionId", "subscription_id"]) {
          const hint = charge.metadata?.[key]
          requireFact(!hint || relevant.some((entry) => entry.subscription === hint), "unknown_charge_mapping")
        }
        requireFact(!connect || relevant.length === 0, "conflicting_connect_billing_charge")
        requireFact(connect || mapped.size > 0 || intent !== null, "unknown_charge_mapping")
        requireFact(mapped.size > 0 || connect || (!charge.metadata?.subscriptionId && !charge.metadata?.subscription_id), "unknown_charge_mapping")
        requireFact(typeof charge.disputed === "boolean", "unknown_charge_dispute")
        facts.push({ charge: charge.id, intent, invoices: [...mapped].sort(), connect, disputed: charge.disputed })
        if (connect || relevant.length === 0) continue
        // A charge paying multiple subscription invoices cannot yield a unique risk binding.
        requireFact(relevant.length === 1, "ambiguous_dispute_subscription")
        const disputes = await all((cursor) => stripe.disputes.list({ charge: charge.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }))
        requireFact(!charge.disputed || disputes.length > 0, "missing_charge_dispute")
        for (const dispute of disputes) {
          requireFact(id(dispute.charge) === charge.id && (!dispute.payment_intent || id(dispute.payment_intent) === intent), "conflicting_dispute_charge")
          const blocking = trialDisputeIsBlocking(dispute.status)
          const entry = relevant[0]
          result.risks.push({ kind: "subscription_dispute", stripeObjectId: id(dispute), stripeCustomerId: customer.id,
            stripeSubscriptionId: entry.subscription!, stripeInvoiceId: entry.invoice.id, stripeChargeId: charge.id,
            stripeStatus: dispute.status, blocking })
        }
      }
      // Absence from a provider list is not resolution of a previously known risk.
      for (const previous of previousRisks) {
        requireFact(previous.stripeCustomerId === customer.id, "conflicting_previous_risk")
        const current = result.risks.find((risk) => risk.kind === previous.kind && risk.stripeObjectId === previous.stripeObjectId)
        requireFact(current && current.stripeSubscriptionId === previous.stripeSubscriptionId &&
          current.stripeInvoiceId === previous.stripeInvoiceId && current.stripeChargeId === previous.stripeChargeId, "unreadable_previous_risk")
      }
    }
    if (result.risks.some((risk) => risk.blocking)) restrictions.add("billing_risk")
    result.available = true
    result.restrictions = [...restrictions].sort()
    result.eligible = restrictions.size === 0
    result.source = result.eligible ? result.snapshot ? "stripe_trial" : "admin_grant" : null
    result.resolution = result.eligible ? null : "billing_portal_or_support"
    result.risks.sort((a, b) => `${a.kind}:${a.stripeObjectId}`.localeCompare(`${b.kind}:${b.stripeObjectId}`))
    result.fingerprint = createHash("sha256").update(canonical({
      profile, facts: facts.map(canonical).sort(), risks: result.risks, restrictions: result.restrictions, source: result.source,
    })).digest("hex")
    return result
  } catch (error) {
    return { ...result, eligible: false, source: null, available: false, fingerprint: null,
      restrictions: [...restrictions, error instanceof StripeSnapshotError ? error.code : "provider_unavailable"].sort() }
  }
}