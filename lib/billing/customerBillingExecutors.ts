import "server-only"
import type Stripe from "stripe"
import { z } from "zod"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { billingCustomerPrerequisiteId, billingMutationInputHash, tenantBillingMutations,
  type BillingStepVerification, type CustomerBillingReservationInput } from "@/lib/billing/tenantBillingMutationCoordinator"
import { TenantBillingConflictError, type CustomerBillingFence } from "@/lib/billing/tenantBillingFence"
import { reconcileStripeSubscription, retrieveSubscriptionWithLatestInvoice, stripeObjectId } from "@/lib/billing/stripeSubscriptions"
import { billingJson, billingProviderStep, customerBillingIntentSchema, discoverCustomerBillingSubscription,
  freezeCustomerBillingPlan, frozenBillingPriceTier, initialBillingStep, readFrozenBillingPlan, rootBillingAction,
  schedulePhaseStep, type CustomerBillingIntent } from "@/lib/billing/customerBillingPlan"
import type { TenantBillingMutation, TenantBillingMutationStep, UserProfile } from "@/lib/generated/prisma/client"
import { retrieveCustomerBillingEvidence } from "@/lib/billing/customerBillingEvidence"

type Coordinator = typeof tenantBillingMutations
const fail = (code: string): never => { throw new TenantBillingConflictError(code) }
const id = z.string().min(1)
const requestId = (value: unknown): string | undefined => {
  const parsed = z.object({ lastResponse: z.object({ requestId: id }).optional() }).safeParse(value)
  return parsed.success ? parsed.data.lastResponse?.requestId : undefined
}
function owner(metadata: Record<string, string> | null | undefined, userId: string, operationId?: string): void {
  if ((metadata?.userId && metadata.userId !== userId) || (metadata?.user_id && metadata.user_id !== userId) ||
      (operationId && (metadata?.userId !== userId || metadata?.operationId !== operationId))) return fail("billing_owner_evidence_conflict")
}

/** Only locally validated non-dispatch or explicit provider validation rejection is definitive. */
export class KnownUnsentBillingError extends Error {
  constructor() { super("billing_request_invalid"); this.name = "KnownUnsentBillingError" }
}
export function classifyBillingProviderFailure(error: unknown): "definitive" | "uncertain" {
  if (error instanceof KnownUnsentBillingError) return "definitive"
  const parsed = z.object({ type: z.literal("StripeInvalidRequestError"), statusCode: z.literal(400),
    requestId: id, code: z.string().optional() }).safeParse(error)
  return parsed.success && !["idempotency_key_in_use", "idempotency_error"].includes(parsed.data.code ?? "") ? "definitive" : "uncertain"
}

/** Internal keyed SDK adapters shared by authenticated mutation routes and explicit recovery. */
export function createCustomerBillingExecutors(dependencies?: { stripe: Stripe; coordinator: Coordinator }) {
  const coordinator = dependencies?.coordinator ?? tenantBillingMutations
  const provider = (): Stripe => dependencies?.stripe ?? createStripeClient({ maxNetworkRetries: 0 })

  async function accept(input: {
    operationId: string; expectedVersion: number; intent: CustomerBillingIntent; profile: UserProfile; email?: string;
  }): ReturnType<Coordinator["reserve"]> {
    const intent = customerBillingIntentSchema.parse(input.intent), userId = input.profile.userId
    const prior = await coordinator.findAccepted(userId, input.operationId)
    if (prior) {
      const frozen = readFrozenBillingPlan(prior.normalizedInput)
      if (JSON.stringify(frozen.intent) !== JSON.stringify(intent)) return fail("billing_operation_key_conflict")
      // Do not consult today's provider/config/version to replay an accepted business intent.
      return coordinator.reserve({ operationId: prior.id, userId, actorUserId: userId, action: prior.action,
        expectedVersion: input.expectedVersion, normalizedInput: billingJson(prior.normalizedInput), inputHash: prior.inputHash, steps: [] })
    }
    if (input.expectedVersion !== input.profile.billingAccessVersion) return fail("billing_version_conflict")
    const stripe = provider(), profile = input.profile
    if (profile.stripeSubscriptionId && !profile.stripeCustomerId) return fail("billing_binding_conflict")
    const localCancel = intent.kind === "cancel" && profile.subscriptionStatus === "trialing" && !profile.stripeSubscriptionId
    if (profile.stripeCustomerId && !localCancel) {
      const customer = await stripe.customers.retrieve(profile.stripeCustomerId)
      if (customer.deleted || customer.id !== profile.stripeCustomerId) return fail("billing_customer_evidence_conflict")
      owner(customer.metadata, userId)
    }
    let subscription: Stripe.Subscription | null = null
    if (["checkout", "downgrade", "cancel"].includes(intent.kind) && !localCancel) {
      subscription = await discoverCustomerBillingSubscription(stripe, profile, intent.kind as "checkout" | "downgrade" | "cancel")
    }
    if (intent.kind === "cancel" && !localCancel && !subscription) return fail("billing_subscription_not_supported")
    if (intent.kind === "undo_downgrade") {
      if (!profile.stripeCustomerId || !profile.stripeSubscriptionId || !profile.stripeScheduleId) return fail("billing_schedule_missing")
      subscription = await retrieveSubscriptionWithLatestInvoice(stripe, profile.stripeSubscriptionId)
      const current = reconcileStripeSubscription(subscription, { subscriptionId: profile.stripeSubscriptionId, binding: profile })
      const schedule = await stripe.subscriptionSchedules.retrieve(profile.stripeScheduleId)
      if (current.kind !== "current" || schedule.id !== profile.stripeScheduleId ||
          stripeObjectId(schedule.customer) !== profile.stripeCustomerId || stripeObjectId(schedule.subscription) !== subscription.id ||
          !["active", "not_started"].includes(schedule.status)) return fail("billing_schedule_evidence_conflict")
      owner(schedule.metadata, userId)
    }
    const action = rootBillingAction(intent, subscription)
    const plan = freezeCustomerBillingPlan(intent, profile, subscription)
    const normalizedInput = billingJson(plan)
    const request: CustomerBillingReservationInput = { operationId: input.operationId, userId, actorUserId: userId, action,
      expectedVersion: input.expectedVersion, normalizedInput, inputHash: billingMutationInputHash(action, normalizedInput), steps: [] }
    if (action !== "cancel") {
      if (profile.stripeCustomerId) request.steps = [initialBillingStep(action, plan, profile.stripeCustomerId, userId, input.operationId)]
      else {
        const params: Stripe.CustomerCreateParams = { ...(input.email ? { email: input.email } : {}),
          metadata: { userId, operationId: billingCustomerPrerequisiteId(input.operationId) } }
        request.customerPrerequisite = { normalizedInput: billingJson(params), step: billingProviderStep("customer_create", "/v1/customers", params) }
      }
    }
    return coordinator.reserve(request)
  }

  async function mutate(stripe: Stripe, step: Readonly<TenantBillingMutationStep>): Promise<unknown> {
    // Frozen requests are never reconstructed from env/config. Targets are closed SDK endpoints.
    const params = step.normalizedRequest
    const options: Stripe.RequestOptions = { idempotencyKey: step.stripeIdempotencyKey, maxNetworkRetries: 0 }
    if (!params || Array.isArray(params) || typeof params !== "object") throw new KnownUnsentBillingError()
    switch (step.stepKey) {
      case "customer_create": return stripe.customers.create(params as Stripe.CustomerCreateParams, options)
      case "checkout_create": return stripe.checkout.sessions.create(params as Stripe.Checkout.SessionCreateParams, options)
      case "portal_create": case "cancel_portal_create": return stripe.billingPortal.sessions.create(params as Stripe.BillingPortal.SessionCreateParams, options)
      case "upgrade": {
        const target = /^\/v1\/subscriptions\/([^/]+)$/.exec(step.objectTarget)?.[1]
        if (!target) throw new KnownUnsentBillingError()
        return stripe.subscriptions.update(target, params as Stripe.SubscriptionUpdateParams, options)
      }
      case "schedule_create": return stripe.subscriptionSchedules.create(params as Stripe.SubscriptionScheduleCreateParams, options)
      case "schedule_phase_update": {
        const target = /^\/v1\/subscription_schedules\/([^/]+)$/.exec(step.objectTarget)?.[1]
        if (!target) throw new KnownUnsentBillingError()
        return stripe.subscriptionSchedules.update(target, params as Stripe.SubscriptionScheduleUpdateParams, options)
      }
      case "schedule_release": {
        const target = /^\/v1\/subscription_schedules\/([^/]+)\/release$/.exec(step.objectTarget)?.[1]
        if (!target) throw new KnownUnsentBillingError()
        return stripe.subscriptionSchedules.release(target, params as Stripe.SubscriptionScheduleReleaseParams, options)
      }
      default: throw new KnownUnsentBillingError()
    }
  }

  async function verify(stripe: Stripe, operation: TenantBillingMutation, step: TenantBillingMutationStep,
    profile: UserProfile, returned: unknown): Promise<BillingStepVerification> {
    const returnedId = z.object({ id }).parse(returned).id
    const refs = { ...(requestId(returned) ? { stripeRequestId: requestId(returned) } : {}) }
    const params = z.record(z.string(), z.json()).parse(step.normalizedRequest)
    if (step.stepKey === "customer_create") {
      const customer = await stripe.customers.retrieve(returnedId)
      if (customer.deleted || customer.id !== returnedId || profile.stripeCustomerId) return fail("billing_customer_evidence_conflict")
      owner(customer.metadata, profile.userId, operation.id)
      return { kind: "succeeded", proof: { customerId: customer.id, operationId: operation.id },
        refs: { ...refs, stripeCustomerId: customer.id }, safeResponse: {} }
    }
    const plan = readFrozenBillingPlan(operation.normalizedInput)
    if (!profile.stripeCustomerId || operation.stripeCustomerId !== profile.stripeCustomerId) return fail("billing_binding_conflict")
    const customer = await stripe.customers.retrieve(profile.stripeCustomerId)
    if (customer.deleted || customer.id !== profile.stripeCustomerId) return fail("billing_customer_evidence_conflict")
    owner(customer.metadata, profile.userId)
    const baseRefs = { ...refs, stripeCustomerId: profile.stripeCustomerId }
    if (step.stepKey === "checkout_create") {
      const session = await stripe.checkout.sessions.retrieve(returnedId, { expand: ["line_items"] })
      owner(session.metadata, profile.userId, operation.id)
      const lines = session.line_items
      if (session.id !== returnedId || stripeObjectId(session.customer) !== profile.stripeCustomerId || session.mode !== "subscription" ||
          !lines || lines.has_more || lines.data.length !== 1 || stripeObjectId(lines.data[0].price) !== plan.priceId || lines.data[0].quantity !== 1 ||
          session.success_url !== plan.successUrl || session.cancel_url !== plan.cancelUrl || !session.url) return fail("billing_session_evidence_conflict")
      return { kind: "succeeded", proof: { sessionId: session.id, mode: session.mode, operationId: operation.id, creationOnly: true },
        refs: { ...baseRefs, stripeSessionId: session.id }, safeResponse: { url: session.url } }
    }
    if (step.stepKey === "portal_create" || step.stepKey === "cancel_portal_create") {
      // Pinned API has no retrieve or metadata. The authenticated keyed response is the proof.
      const session = returned as Stripe.BillingPortal.Session
      if (session.customer !== profile.stripeCustomerId || session.return_url !== plan.returnUrl || !session.url) return fail("billing_session_evidence_conflict")
      if (step.stepKey === "cancel_portal_create" && (session.flow?.type !== "subscription_cancel" ||
          session.flow.subscription_cancel?.subscription !== profile.stripeSubscriptionId ||
          session.flow.after_completion.type !== "redirect" ||
          session.flow.after_completion.redirect?.return_url !== (params.flow_data as { after_completion: { redirect: { return_url: string } } }).after_completion.redirect.return_url)) {
        return fail("billing_session_evidence_conflict")
      }
      return { kind: "succeeded", proof: { sessionId: session.id, keyedResponse: true, creationOnly: true },
        refs: { ...baseRefs, stripeSessionId: session.id }, safeResponse: { url: session.url } }
    }
    if (!profile.stripeSubscriptionId || profile.stripeSubscriptionId !== plan.subscriptionId) return fail("billing_binding_conflict")
    const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, profile.stripeSubscriptionId)
    const current = reconcileStripeSubscription(subscription, { subscriptionId: profile.stripeSubscriptionId, binding: profile,
      priceTier: frozenBillingPriceTier(operation.normalizedInput) })
    if (current.kind !== "current") return fail("billing_binding_conflict")
    const subscriptionRefs = { ...baseRefs, stripeSubscriptionId: subscription.id }
    if (step.stepKey === "upgrade") {
      const updated = returned as Stripe.Subscription
      owner(updated.metadata, profile.userId, operation.id)
      if (updated.id !== subscription.id || stripeObjectId(updated.customer) !== profile.stripeCustomerId ||
          updated.items.has_more || updated.items.data.length !== 1 || stripeObjectId(updated.items.data[0].price) !== plan.priceId) return fail("billing_upgrade_evidence_conflict")
      return { kind: "succeeded", proof: { subscriptionId: subscription.id, operationId: operation.id,
        startingItemId: plan.subscriptionItemId, returnedPriceId: plan.priceId!, currentStatus: subscription.status },
        refs: subscriptionRefs, safeResponse: { url: plan.successUrl } }
    }
    const schedule = await stripe.subscriptionSchedules.retrieve(returnedId)
    if (schedule.id !== returnedId || stripeObjectId(schedule.customer) !== profile.stripeCustomerId) return fail("billing_schedule_evidence_conflict")
    owner(schedule.metadata, profile.userId)
    const scheduleRefs = { ...subscriptionRefs, stripeScheduleId: schedule.id }
    if (step.stepKey === "schedule_release") {
      if (schedule.id !== plan.scheduleId || schedule.status !== "released" || schedule.released_subscription !== subscription.id) return fail("billing_schedule_evidence_conflict")
      return { kind: "succeeded", proof: { scheduleId: schedule.id, releasedSubscription: subscription.id }, refs: scheduleRefs, safeResponse: { cancelled: true } }
    }
    if (stripeObjectId(schedule.subscription) !== subscription.id || !["active", "not_started"].includes(schedule.status)) return fail("billing_schedule_evidence_conflict")
    if (step.stepKey === "schedule_create") {
      const created = returned as Stripe.SubscriptionSchedule
      if (stripeObjectId(created.customer) !== profile.stripeCustomerId || stripeObjectId(created.subscription) !== subscription.id || params.from_subscription !== subscription.id) {
        return fail("billing_schedule_evidence_conflict")
      }
      const phaseStartDate = created.phases[0]?.start_date ?? null
      if (phaseStartDate !== null) z.number().int().nonnegative().parse(phaseStartDate)
      return { kind: "succeeded", proof: { scheduleId: schedule.id, keyedResponse: true, phaseStartDate }, refs: scheduleRefs }
    }
    owner(schedule.metadata, profile.userId, operation.id)
    const phases = params.phases as { start_date?: number; end_date?: number; items: { price: string; quantity: number }[] }[]
    if (schedule.phases.length !== 2 || schedule.phases.some((phase, index) => phase.items.length !== 1 ||
        stripeObjectId(phase.items[0].price) !== phases[index].items[0].price || phase.items[0].quantity !== 1) ||
        schedule.phases[0].end_date !== plan.currentPeriodEnd || schedule.phases[1].start_date !== plan.currentPeriodEnd ||
        (phases[0].start_date !== undefined && schedule.phases[0].start_date !== phases[0].start_date)) return fail("billing_schedule_evidence_conflict")
    return { kind: "succeeded", proof: { scheduleId: schedule.id, operationId: operation.id, phasesVerified: true },
      refs: scheduleRefs, safeResponse: { scheduledAt: new Date(plan.currentPeriodEnd! * 1000).toISOString() } }
  }

  async function executeStep(stripe: Stripe, userId: string, fence: CustomerBillingFence, stepKey: string): Promise<void> {
    let returned: unknown
    try { returned = await coordinator.dispatch(userId, fence, stepKey, (step) => mutate(stripe, step)) }
    catch (error) {
      if (classifyBillingProviderFailure(error) === "definitive") {
        await coordinator.recordStep(userId, fence, stepKey, async ({ step }) => {
          // A rejection on a later dispatch cannot prove an earlier uncertain attempt had no effect.
          if (step.attempts !== 1) return fail("billing_outcome_unknown")
          return { kind: "rejected", proof: { definitiveValidationRejection: true, knownUnsent: error instanceof KnownUnsentBillingError }, failureCode: "billing_provider_rejected" }
        })
        // finalize refuses partial effects (including a successful customer prerequisite).
        await coordinator.finalize(stripe, userId, fence)
      }
      throw error
    }
    try {
      await coordinator.recordStep(userId, fence, stepKey, ({ operation, step, profile }) => verify(stripe, operation, step, profile, returned))
    } catch (error) {
      try { await coordinator.uncertain(userId, fence, stepKey) } catch { /* durable attempt survives DB/fence failure */ }
      throw error
    }
  }

  async function recoverStep(stripe: Stripe, userId: string, fence: CustomerBillingFence, step: TenantBillingMutationStep): Promise<void> {
    if (!step.firstAttemptAt) return executeStep(stripe, userId, fence, step.stepKey)
    // Exactly one observation/discovery and at most one identical keyed dispatch.
    // Failed verification is uncertainty, not permission to retry a conflicting object.
    const state = await coordinator.inspect(userId, fence)
    const candidate = await retrieveCustomerBillingEvidence(stripe, state.operation, step)
    if (candidate !== undefined) {
      await coordinator.recordStep(userId, fence, step.stepKey, ({ operation, step: current, profile }) =>
        verify(stripe, operation, current, profile, candidate))
      return
    }
    // dispatch enforces the per-step durable clock STRICTLY before +24h, under the fence.
    await executeStep(stripe, userId, fence, step.stepKey)
  }

  async function execute(userId: string, reservedOperationId: string, leaseOwner: string, recovery = false): Promise<TenantBillingMutation> {
    const stripe = provider()
    const runStep = async (fence: CustomerBillingFence, step: TenantBillingMutationStep): Promise<void> => {
      if (step.status === "succeeded") return
      if (step.status === "failed") return fail("billing_partial_outcome")
      if (recovery) await recoverStep(stripe, userId, fence, step)
      else await executeStep(stripe, userId, fence, step.stepKey)
    }
    let fence = await coordinator.claim(userId, reservedOperationId, leaseOwner)
    let state = await coordinator.inspect(userId, fence)
    if (state.operation.action === "customer_create") {
      if (state.steps[0]?.status === "failed") return coordinator.finalize(stripe, userId, fence)
      await runStep(fence, state.steps[0])
      const root = await coordinator.handoff(stripe, userId, fence)
      fence = await coordinator.claim(userId, root.id, leaseOwner)
      state = await coordinator.inspect(userId, fence)
    }
    if (state.operation.action === "cancel") return coordinator.finalize(stripe, userId, fence)
    const plan = readFrozenBillingPlan(state.operation.normalizedInput)
    if (plan.subscriptionId && !state.profile.stripeSubscriptionId) {
      fence = await coordinator.bindDiscoveredSubscription(stripe, userId, fence, plan.subscriptionId)
      state = await coordinator.inspect(userId, fence)
    }
    if (!state.profile.stripeCustomerId) return fail("billing_binding_conflict")
    if (!state.steps.length) {
      await coordinator.freezeStep(userId, fence, initialBillingStep(state.operation.action, plan, state.profile.stripeCustomerId, userId, state.operation.id))
      state = await coordinator.inspect(userId, fence)
    }
    const initial = state.steps[0]
    if (initial.status === "failed" && state.steps.length === 1) return coordinator.finalize(stripe, userId, fence)
    await runStep(fence, initial)
    if (state.operation.action === "schedule_downgrade") {
      state = await coordinator.inspect(userId, fence)
      if (state.steps.length === 1) {
        // Recover from the DURABLE create proof, never today's schedule start/config.
        const proof = z.object({ proof: z.object({ scheduleId: id, phaseStartDate: z.number().int().nonnegative().nullable() }) }).parse(state.steps[0].providerResult).proof
        await coordinator.freezeStep(userId, fence, schedulePhaseStep(plan, proof.scheduleId, proof.phaseStartDate, userId, state.operation.id))
        state = await coordinator.inspect(userId, fence)
      }
      await runStep(fence, state.steps[1])
    }
    return coordinator.finalize(stripe, userId, fence)
  }
  async function recover(userId: string, operationId: string, leaseOwner: string): Promise<TenantBillingMutation> {
    const state = await coordinator.readOwn(userId, operationId)
    if (!["pending", "reconciliation_required"].includes(state.operation.status)) return state.operation
    if (!state.reserved) return fail("billing_mutation_in_progress")
    if (state.reserved.id === state.operation.id && state.reserved.stripeSubscriptionId !== state.profile.stripeSubscriptionId) {
      return coordinator.supersedeKnown(provider(), userId, operationId, leaseOwner)
    }
    return execute(userId, state.reserved.id, leaseOwner, true)
  }
  return { accept, execute, recover }
}

export const customerBillingExecutors = createCustomerBillingExecutors()