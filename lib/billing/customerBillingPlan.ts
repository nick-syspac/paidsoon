import "server-only"
import type Stripe from "stripe"
import { z } from "zod"
import { normalizeSubscriptionTier, PLAN_ORDER, type SubscriptionTier } from "@/lib/subscriptionPlans"
import { TenantBillingConflictError } from "@/lib/billing/tenantBillingFence"
import { reconcileStripeSubscription, retrieveSubscriptionWithLatestInvoice, stripeObjectId } from "@/lib/billing/stripeSubscriptions"
import type { BillingStepInput } from "@/lib/billing/tenantBillingMutationCoordinator"
import type { TenantBillingMutationAction, UserProfile } from "@/lib/generated/prisma/client"

const publicTier = z.enum(["essentials", "business_control", "small_business", "business_pro"])
export const customerBillingIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("checkout"), tier: publicTier }).strict(),
  z.object({ kind: z.literal("downgrade"), tier: publicTier }).strict(),
  z.object({ kind: z.enum(["cancel", "portal", "undo_downgrade"]) }).strict(),
])
export type CustomerBillingIntent = z.infer<typeof customerBillingIntentSchema>
const catalogSchema = z.record(z.string().min(1), publicTier)
const planSchema = z.object({
  intent: customerBillingIntentSchema, priceCatalog: catalogSchema,
  returnUrl: z.url(), redirectUrl: z.url(), successUrl: z.url(), cancelUrl: z.url(),
  priceId: z.string().min(1).nullable(), trialDays: z.number().positive().nullable(),
  subscriptionId: z.string().nullable(), subscriptionItemId: z.string().nullable(), currentPriceId: z.string().nullable(),
  currentPeriodEnd: z.number().int().positive().nullable(), scheduleId: z.string().nullable(),
}).strict()
export type FrozenCustomerBillingPlan = z.infer<typeof planSchema>
export type BillingJson = BillingStepInput["normalizedRequest"]
export const billingJson = (value: unknown): BillingJson => z.json().parse(JSON.parse(JSON.stringify(value)))
const fail = (code: string): never => { throw new TenantBillingConflictError(code) }

/** Legacy normalization remains a route/service-input convention, never a grant rule. */
export function normalizeCustomerBillingIntent(kind: CustomerBillingIntent["kind"], tier?: string): CustomerBillingIntent {
  return customerBillingIntentSchema.parse(kind === "checkout" || kind === "downgrade"
    ? { kind, tier: normalizeSubscriptionTier(tier) } : { kind })
}
export function readFrozenBillingPlan(value: unknown): FrozenCustomerBillingPlan { return planSchema.parse(value) }

/** A journal's accepted catalog survives price-env drift. Old coordinator callers retain their existing mapper. */
export function frozenBillingPriceTier(value: unknown): ((priceId: string) => SubscriptionTier) | undefined {
  if (!value || typeof value !== "object" || !("priceCatalog" in value)) return undefined
  const catalog = catalogSchema.parse(value.priceCatalog)
  return (id) => catalog[id] ?? fail("billing_unknown_price")
}

export function freezeCustomerBillingPlan(
  intent: CustomerBillingIntent, profile: UserProfile, subscription: Stripe.Subscription | null,
  env: NodeJS.ProcessEnv = process.env,
): FrozenCustomerBillingPlan {
  const priceCatalog: Record<string, z.infer<typeof publicTier>> = {}
  for (const [tier, variable] of [
    ["essentials", "STRIPE_STARTER_PRICE_ID"], ["business_control", "STRIPE_SOLO_PRICE_ID"],
    ["small_business", "STRIPE_SMALL_BUSINESS_PRICE_ID"], ["business_pro", "STRIPE_BUSINESS_PRO_PRICE_ID"],
  ] as const) {
    const id = env[variable]
    if (!id) continue
    if (priceCatalog[id]) return fail("billing_ambiguous_price")
    priceCatalog[id] = tier
  }
  const requestedTier = "tier" in intent ? intent.tier : null
  const priceId = requestedTier ? Object.keys(priceCatalog).find((id) => priceCatalog[id] === requestedTier) ?? null : null
  if (requestedTier && !priceId) return fail("billing_price_not_configured")
  const returnUrl = `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings/subscription`
  const trialDays = Number(env.STRIPE_TRIAL_PERIOD_DAYS ?? 14)
  const currentPriceId = subscription ? stripeObjectId(subscription.items.data[0]?.price) : null
  const invoicePeriodEnd = subscription && typeof subscription.latest_invoice === "object"
    ? subscription.latest_invoice?.period_end ?? null : null
  // Cancellation's existing display fallback is frozen, never projected as Stripe state.
  const currentPeriodEnd = invoicePeriodEnd ?? (intent.kind === "cancel" && profile.subscriptionCurrentPeriodEnd
    ? Math.floor(profile.subscriptionCurrentPeriodEnd.getTime() / 1000) : null)
  const plan = planSchema.parse({ intent, priceCatalog, returnUrl,
    redirectUrl: `${returnUrl}?cancellation=ended`,
    successUrl: intent.kind === "checkout" && subscription
      ? `${returnUrl}?success=upgraded&tier=${intent.tier}`
      : `${env.NEXT_PUBLIC_APP_URL}/api/billing/checkout/success?session_id={CHECKOUT_SESSION_ID}&tier=${requestedTier}`,
    cancelUrl: `${returnUrl}?cancelled=true`, priceId,
    trialDays: Number.isFinite(trialDays) && trialDays > 0 ? trialDays : null,
    subscriptionId: subscription?.id ?? null, subscriptionItemId: subscription?.items.data[0]?.id ?? null, currentPriceId, currentPeriodEnd,
    scheduleId: profile.stripeScheduleId,
  })
  if (intent.kind === "checkout" && subscription) {
    const current = PLAN_ORDER.indexOf(priceCatalog[currentPriceId!] ?? fail("billing_unknown_price"))
    const target = PLAN_ORDER.indexOf(intent.tier)
    if (target < current) return fail("billing_use_downgrade")
    if (target === current && ["active", "trialing"].includes(subscription.status)) return fail("billing_already_active")
  }
  if (intent.kind === "downgrade") {
    if (!subscription || PLAN_ORDER.indexOf(intent.tier) >= PLAN_ORDER.indexOf(priceCatalog[currentPriceId!] ?? fail("billing_unknown_price"))) {
      return fail("billing_invalid_downgrade")
    }
    if (!currentPriceId || !currentPeriodEnd || subscription.schedule) return fail("billing_unsupported_schedule")
  }
  return plan
}

/** Read-only, exhaustive discovery. No first-list-entry selection or swallowed retrieval errors. */
export async function discoverCustomerBillingSubscription(
  stripe: Stripe, profile: UserProfile, kind: "checkout" | "cancel" | "downgrade",
): Promise<Stripe.Subscription | null> {
  if (!profile.stripeCustomerId) {
    if (profile.stripeSubscriptionId) return fail("billing_binding_conflict")
    return null
  }
  const supported = kind === "cancel" ? ["active", "trialing", "past_due", "unpaid"]
    : kind === "downgrade" && !profile.stripeSubscriptionId ? ["active"] : ["active", "trialing", "past_due", "unpaid", "incomplete"]
  const all: Stripe.Subscription[] = []
  let startingAfter: string | undefined
  do {
    const page = await stripe.subscriptions.list({ customer: profile.stripeCustomerId, status: "all", limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}) })
    if (page.data.some((row) => all.some((prior) => prior.id === row.id))) return fail("billing_ambiguous_subscriptions")
    all.push(...page.data)
    if (!page.has_more) break
    const last = page.data.at(-1)?.id
    if (!last || last === startingAfter) return fail("billing_ambiguous_subscriptions")
    startingAfter = last
  } while (true)
  const live = all.filter((row) => !["canceled", "incomplete_expired"].includes(row.status))
  if (live.length > 1 || live.some((row) => !supported.includes(row.status))) return fail("billing_ambiguous_subscriptions")
  const candidate = live[0]
  if (profile.stripeSubscriptionId && candidate?.id !== profile.stripeSubscriptionId) return fail("billing_binding_conflict")
  if (!candidate) {
    // A stored ID is never silently replaced with a new subscription/create.
    if (profile.stripeSubscriptionId) return fail("billing_subscription_not_supported")
    return null
  }
  const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, candidate.id)
  const current = reconcileStripeSubscription(subscription, { subscriptionId: candidate.id, binding: profile })
  if (current.kind !== "current" || !supported.includes(subscription.status)) return fail("billing_binding_conflict")
  const price = subscription.items.data[0].price
  if (price.type !== "recurring" || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 ||
      (subscription.items.data[0].quantity ?? 1) !== 1) return fail("billing_unsupported_items")
  return subscription
}

export function rootBillingAction(intent: CustomerBillingIntent, subscription: Stripe.Subscription | null): TenantBillingMutationAction {
  switch (intent.kind) {
    case "checkout": return subscription ? "upgrade" : "checkout_create"
    case "cancel": return subscription ? "cancel_portal_create" : "cancel"
    case "portal": return "portal_create"
    case "downgrade": return "schedule_downgrade"
    case "undo_downgrade": return "undo_downgrade"
  }
}

export function billingProviderStep(stepKey: string, objectTarget: string, params: unknown): BillingStepInput {
  return { stepKey, method: "POST", objectTarget, normalizedRequest: billingJson(params) }
}

export function initialBillingStep(
  action: TenantBillingMutationAction, plan: FrozenCustomerBillingPlan, customer: string, userId: string, operationId: string,
): BillingStepInput {
  const correlation = { userId, operationId }
  switch (action) {
    case "checkout_create": {
      const params: Stripe.Checkout.SessionCreateParams = {
        customer, mode: "subscription", line_items: [{ price: plan.priceId!, quantity: 1 }],
        subscription_data: { ...(plan.trialDays ? { trial_period_days: plan.trialDays } : {}),
          metadata: { user_id: userId, plan: "tier" in plan.intent ? plan.intent.tier : "", source: "paidsoon_checkout", ...correlation } },
        success_url: plan.successUrl, cancel_url: plan.cancelUrl,
        metadata: { user_id: userId, plan: "tier" in plan.intent ? plan.intent.tier : "",
          selectedTier: "tier" in plan.intent ? plan.intent.tier : "", source: "paidsoon_checkout", ...correlation },
      }
      return billingProviderStep(action, "/v1/checkout/sessions", params)
    }
    case "upgrade": {
      const params: Stripe.SubscriptionUpdateParams = { items: [{ price: plan.priceId! }], proration_behavior: "create_prorations", metadata: correlation }
      return billingProviderStep(action, `/v1/subscriptions/${plan.subscriptionId}`, params)
    }
    case "portal_create": {
      const params: Stripe.BillingPortal.SessionCreateParams = { customer, return_url: plan.returnUrl }
      return billingProviderStep(action, "/v1/billing_portal/sessions", params)
    }
    case "cancel_portal_create": {
      const success = new URL(plan.returnUrl)
      success.searchParams.set("cancellation", "scheduled")
      if (plan.currentPeriodEnd) success.searchParams.set("cancelAt", new Date(plan.currentPeriodEnd * 1000).toISOString())
      const params: Stripe.BillingPortal.SessionCreateParams = { customer, return_url: plan.returnUrl,
        flow_data: { type: "subscription_cancel", subscription_cancel: { subscription: plan.subscriptionId! },
          after_completion: { type: "redirect", redirect: { return_url: success.toString() } } } }
      return billingProviderStep(action, "/v1/billing_portal/sessions", params)
    }
    case "schedule_downgrade": {
      // from_subscription cannot be combined with phase/config changes in this SDK.
      const params: Stripe.SubscriptionScheduleCreateParams = { from_subscription: plan.subscriptionId! }
      return billingProviderStep("schedule_create", "/v1/subscription_schedules", params)
    }
    case "undo_downgrade": return billingProviderStep("schedule_release", `/v1/subscription_schedules/${plan.scheduleId}/release`, {})
    default: return fail("billing_step_conflict")
  }
}

export function schedulePhaseStep(plan: FrozenCustomerBillingPlan, scheduleId: string, start: number | null,
  userId: string, operationId: string): BillingStepInput {
  const params: Stripe.SubscriptionScheduleUpdateParams = { phases: [
    { ...(start ? { start_date: start } : {}), items: [{ price: plan.currentPriceId!, quantity: 1 }], end_date: plan.currentPeriodEnd! },
    { items: [{ price: plan.priceId!, quantity: 1 }] },
  ], metadata: { userId, operationId } }
  return billingProviderStep("schedule_phase_update", `/v1/subscription_schedules/${scheduleId}`, params)
}