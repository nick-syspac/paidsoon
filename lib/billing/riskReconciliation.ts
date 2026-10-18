import "server-only"
import type Stripe from "stripe"
import { prismaAdmin } from "@/lib/db/admin"
import { coordinateTenantBilling } from "@/lib/billing/tenantBillingCoordinator"
import { finishWebhookEvent, type WebhookClaim } from "@/lib/billing/webhookLedger"
import {
  readAllStripePages, requireStripeId, verifyTrialBillingIdentity,
  trialInvoiceSubscription, trialInvoiceRisk, trialDisputeIsBlocking,
  type TrialBillingRiskEvidence, type TrialEligibilityProfile,
} from "@/lib/billing/trialEligibility"
import {
  reconcileStripeSubscription, resolveStripeBillingProfile,
  retrieveSubscriptionWithLatestInvoice, stripeObjectId, stripeSnapshotProfileData,
  StripeSnapshotError,
} from "@/lib/billing/stripeSubscriptions"

export type BillingRiskTarget = { kind: "subscription_invoice" | "subscription_dispute"; id: string }

function requireFact(condition: unknown, code: string): asserts condition {
  if (!condition) throw new StripeSnapshotError(code)
}

async function chargeForDispute(stripe: Stripe, disputeId: string): Promise<{ dispute: Stripe.Dispute; charge: Stripe.Charge }> {
  const dispute = await stripe.disputes.retrieve(disputeId)
  requireFact(requireStripeId(dispute) === disputeId, "conflicting_stripe_dispute")
  const chargeId = requireStripeId(dispute.charge)
  const charge = await stripe.charges.retrieve(chargeId)
  requireFact(requireStripeId(charge) === chargeId && (!dispute.payment_intent ||
    requireStripeId(dispute.payment_intent) === stripeObjectId(charge.payment_intent)), "conflicting_dispute_charge")
  return { dispute, charge }
}

function isConnect(charge: Stripe.Charge): boolean {
  return Boolean(stripeObjectId(charge.on_behalf_of) || stripeObjectId(charge.transfer_data?.destination) || stripeObjectId(charge.source_transfer))
}

/** Pinned API has no reverse charge filter: legacy direct charges need invoice/payment pagination. */
async function invoiceForCharge(stripe: Stripe, charge: Stripe.Charge): Promise<Stripe.Invoice | null> {
  const customerId = requireStripeId(charge.customer)
  const intent = stripeObjectId(charge.payment_intent)
  const invoiceIds = new Set<string>()
  if (intent) {
    const payments = await readAllStripePages((cursor) => stripe.invoicePayments.list({
      payment: { type: "payment_intent", payment_intent: intent }, limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    }))
    for (const payment of payments) {
      requireFact(payment.payment.type === "payment_intent" && requireStripeId(payment.payment.payment_intent) === intent, "conflicting_invoice_payment")
      invoiceIds.add(requireStripeId(payment.invoice))
    }
  } else {
    const invoices = await readAllStripePages((cursor) => stripe.invoices.list({
      customer: customerId, limit: 100, ...(cursor ? { starting_after: cursor } : {}),
    }))
    for (const invoice of invoices) {
      requireFact(requireStripeId(invoice.customer) === customerId, "conflicting_stripe_customer")
      const payments = await readAllStripePages((cursor) => stripe.invoicePayments.list({
        invoice: invoice.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}),
      }))
      for (const payment of payments) {
        requireFact(requireStripeId(payment.invoice) === invoice.id, "conflicting_invoice_payment")
        if (payment.payment.type === "charge" && requireStripeId(payment.payment.charge) === charge.id) invoiceIds.add(invoice.id)
      }
    }
    requireFact(invoiceIds.size > 0, "unknown_charge_mapping")
  }
  requireFact(invoiceIds.size <= 1, "ambiguous_dispute_subscription")
  if (invoiceIds.size === 0) {
    requireFact(!charge.metadata?.subscriptionId && !charge.metadata?.subscription_id, "unknown_charge_mapping")
    return null // A complete PaymentIntent reverse lookup proves a one-time platform payment.
  }
  const invoiceId = [...invoiceIds][0]
  const invoice = await stripe.invoices.retrieve(invoiceId)
  requireFact(requireStripeId(invoice) === invoiceId && requireStripeId(invoice.customer) === customerId, "conflicting_charge_invoice")
  return invoice
}

/**
 * Intentional, narrowly tenant-scoped RLS bypass for SIGNATURE-VERIFIED platform
 * billing webhooks only. No customer metadata from the delivered event is used.
 * Fresh provider reads occur under the billing lock so two risk handlers cannot
 * commit an older pre-lock observation over a resolved fact. No grant is mutated.
 * Risk/projection/version and terminal webhook status share one fenced commit.
 */
export async function reconcileBillingRiskEvent(
  stripe: Stripe,
  target: BillingRiskTarget,
  stripeEventId: string,
  now: Date = new Date(),
  claim?: WebhookClaim,
): Promise<"processed" | "irrelevant"> {
  requireFact(Number.isFinite(now.getTime()), "invalid_reconciliation_time")
  // Discovery locates a tenant by a CURRENT customer only, never by delivered hints.
  const discovery = target.kind === "subscription_invoice"
    ? await stripe.invoices.retrieve(target.id)
    : (await chargeForDispute(stripe, target.id)).charge
  requireFact(target.kind !== "subscription_invoice" || requireStripeId(discovery) === target.id, "conflicting_stripe_invoice")
  if (target.kind === "subscription_dispute" && isConnect(discovery as Stripe.Charge)) {
    if (claim) await finishWebhookEvent(claim, "skipped", "verified_irrelevant_billing_object")
    return "irrelevant"
  }
  const customerId = requireStripeId(discovery.customer)
  const profile = await resolveStripeBillingProfile({
    byUserId: async () => null,
    byCustomerId: (stripeCustomerId) => prismaAdmin.userProfile.findFirst({ where: { stripeCustomerId } }),
    bySubscriptionId: async () => null,
  }, [{ customer: customerId }], null)
  requireFact(profile, "unknown_billing_customer")

  const irrelevant = { result: "irrelevant" as const, status: "skipped" as const, note: "verified_irrelevant_billing_object" }
  return coordinateTenantBilling<"processed" | "irrelevant">(profile.userId,
    claim ? { kind: "webhook", claim } : { kind: "direct" }, async (tx, current) => {
    requireFact(current.stripeCustomerId === customerId, "conflicting_stripe_binding")
    const binding: TrialEligibilityProfile = current
    const customer = await stripe.customers.retrieve(customerId)
    requireFact(!customer.deleted && requireStripeId(customer) === customerId, "invalid_stripe_customer")
    verifyTrialBillingIdentity(customer, binding, false)
    let charge: Stripe.Charge | null = null
    let dispute: Stripe.Dispute | null = null
    let invoice: Stripe.Invoice | null
    if (target.kind === "subscription_dispute") {
      const source = await chargeForDispute(stripe, target.id)
      charge = source.charge
      dispute = source.dispute
      verifyTrialBillingIdentity(charge, binding)
      verifyTrialBillingIdentity(dispute, binding, false)
      requireFact(!isConnect(charge), "stripe_state_changed")
      invoice = await invoiceForCharge(stripe, charge)
      if (!invoice) {
        requireFact(!dispute.metadata?.subscriptionId && !dispute.metadata?.subscription_id, "unknown_charge_mapping")
        return irrelevant
      }
    } else {
      invoice = await stripe.invoices.retrieve(target.id)
      requireFact(requireStripeId(invoice) === target.id, "conflicting_stripe_invoice")
    }
    const subscriptionId = trialInvoiceSubscription(invoice, binding)
    for (const source of [charge, dispute]) {
      if (!source) continue
      verifyTrialBillingIdentity(source, binding, false)
      for (const key of ["subscriptionId", "subscription_id"]) {
        requireFact(!source.metadata?.[key] || source.metadata[key] === subscriptionId, "unknown_charge_mapping")
      }
    }
    if (!subscriptionId) return irrelevant // Explicit verified manual invoice, not debtor metadata.
    const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
    // Historical canceled subscriptions still own debt; do not rebind the current subscription.
    const verified = reconcileStripeSubscription(subscription, {
      subscriptionId, binding: { ...binding, stripeSubscriptionId: subscriptionId }, sources: [invoice],
    })
    requireFact(verified.kind === "current", "unknown_invoice_subscription")
    const latest = subscription.latest_invoice
    if (latest && typeof latest !== "string" && latest.id === invoice.id) {
      // Do not combine two contradictory reads of the same invoice. Retry fresh.
      requireFact(latest.status === invoice.status && latest.amount_remaining === invoice.amount_remaining &&
        latest.attempt_count === invoice.attempt_count && latest.due_date === invoice.due_date &&
        trialInvoiceSubscription(latest, binding) === subscriptionId, "stripe_state_changed")
    }
    const previous = await tx.tenantBillingRisk.findUnique({
      where: { kind_stripeObjectId: { kind: target.kind, stripeObjectId: target.id } },
    })
    if (previous) {
      requireFact(previous.userId === binding.userId && previous.stripeCustomerId === customerId &&
        previous.stripeSubscriptionId === subscriptionId && previous.stripeInvoiceId === invoice.id &&
        previous.stripeChargeId === (charge?.id ?? null), "conflicting_previous_risk")
    }
    const risk: TrialBillingRiskEvidence = dispute && charge ? {
      kind: "subscription_dispute", stripeObjectId: dispute.id, stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId, stripeInvoiceId: invoice.id, stripeChargeId: charge.id,
      stripeStatus: dispute.status, blocking: trialDisputeIsBlocking(dispute.status),
    } : trialInvoiceRisk(invoice, subscriptionId, customerId, now, previous ? [{
      ...previous, kind: "subscription_invoice", stripeInvoiceId: invoice.id,
    }] : [])
    return {
      result: "processed",
      persist: async (commitTx) => {
        await commitTx.tenantBillingRisk.upsert({
          where: { kind_stripeObjectId: { kind: risk.kind, stripeObjectId: risk.stripeObjectId } },
          create: { ...risk, userId: binding.userId, reconciledAt: now, stripeEventId },
          update: { stripeStatus: risk.stripeStatus, blocking: risk.blocking, reconciledAt: now, stripeEventId },
        })
      },
      // Invoice names do not imply current subscription status (nor resurrect canceled access).
      projection: target.kind === "subscription_invoice" && binding.stripeSubscriptionId === subscriptionId
        ? stripeSnapshotProfileData(verified.snapshot) : undefined,
    }
  })
}