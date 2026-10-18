import "server-only"
import { createHash } from "node:crypto"
import type Stripe from "stripe"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import {
  Prisma, type TenantBillingMutation, type TenantBillingMutationAction,
  type TenantBillingMutationStep, type UserProfile,
} from "@/lib/generated/prisma/client"
import { lockTenantBilling } from "@/lib/billing/tenantBillingLock"
import {
  assertBillingFence, assertBillingReservation, TenantBillingConflictError,
  type CustomerBillingFence,
} from "@/lib/billing/tenantBillingFence"
import {
  reconcileStripeSubscription, retrieveSubscriptionWithLatestInvoice,
  stripeObjectId, stripeSnapshotProfileData, stripeTierForPrice,
} from "@/lib/billing/stripeSubscriptions"
import { DEFAULT_SUBSCRIPTION_TIER } from "@/lib/subscriptionPlans"
import { frozenBillingPriceTier, readFrozenBillingPlan } from "@/lib/billing/customerBillingPlan"

const uuid = z.uuid().transform((value) => value.toLowerCase())
const json = z.json()
type Json = z.infer<typeof json>
const actions = z.enum([
  "customer_create", "checkout_create", "upgrade", "cancel", "cancel_portal_create",
  "schedule_downgrade", "undo_downgrade", "portal_create",
])
/** This matrix is closed; later executors implement these steps, not arbitrary jobs. */
export const BILLING_MUTATION_STEPS: Readonly<Record<TenantBillingMutationAction, readonly string[]>> = {
  customer_create: ["customer_create"], checkout_create: ["checkout_create"], upgrade: ["upgrade"],
  cancel: [], cancel_portal_create: ["cancel_portal_create"],
  schedule_downgrade: ["schedule_create", "schedule_phase_update"],
  undo_downgrade: ["schedule_release"], portal_create: ["portal_create"],
}
const stepInput = z.object({
  stepKey: z.string().min(1), normalizedRequest: json,
  method: z.literal("POST"), objectTarget: z.string().min(1).max(500),
}).strict()
export type BillingStepInput = z.infer<typeof stepInput>
const reservationInput = z.object({
  operationId: uuid, userId: uuid, actorUserId: uuid, action: actions,
  normalizedInput: json, inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedVersion: z.number().int().nonnegative(), steps: z.array(stepInput),
  customerPrerequisite: z.object({ normalizedInput: json, step: stepInput }).strict().optional(),
}).strict()
export type CustomerBillingReservationInput = z.infer<typeof reservationInput>
const refsSchema = z.object({
  stripeCustomerId: z.string().min(1).optional(), stripeSubscriptionId: z.string().min(1).optional(),
  stripeSessionId: z.string().min(1).optional(), stripeScheduleId: z.string().min(1).optional(),
  stripeRequestId: z.string().min(1).optional(),
}).strict()
type ProviderReferences = z.infer<typeof refsSchema>
const proofSchema = z.object({
  mutationId: uuid, stepKey: z.string(), requestHash: z.string(),
  outcome: z.enum(["succeeded", "rejected"]), failureCode: z.string().nullable(),
  proof: z.record(z.string(), json).refine((value) => Object.keys(value).length > 0),
  refs: refsSchema, safeResponse: json.optional(),
}).strict()
export type BillingStepVerification =
  | { kind: "succeeded"; proof: Record<string, Json>; refs: ProviderReferences; safeResponse?: Json }
  | { kind: "rejected"; proof: Record<string, Json>; failureCode: string }
type VerificationContext = Readonly<{
  operation: TenantBillingMutation; step: TenantBillingMutationStep; profile: UserProfile;
}>
type Transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
const unresolved = (status: string): boolean => status === "pending" || status === "reconciliation_required"
const fail = (code: string): never => { throw new TenantBillingConflictError(code) }

/** JSON round-trip rejects undefined/non-JSON values; sort keys for stable hashes. */
function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}
function hash(value: unknown): string { return createHash("sha256").update(canonical(json.parse(value))).digest("hex") }
function dbJson(value: Json): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : JSON.parse(canonical(value)) as Prisma.InputJsonValue
}
export function billingMutationInputHash(action: TenantBillingMutationAction, input: Json): string {
  // Business identity excludes provider results/config. Reserve also compares the
  // complete stored immutable plan on replay, preventing any replacement of it.
  if (action !== "customer_create" && input && !Array.isArray(input) && typeof input === "object" && "intent" in input) {
    return hash({ action, input: readFrozenBillingPlan(input).intent })
  }
  return hash({ action, input })
}
export function billingCustomerPrerequisiteId(rootId: string): string {
  const bytes = createHash("sha256").update(`billing-customer:${uuid.parse(rootId)}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 15) | 0x50; bytes[8] = (bytes[8] & 63) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
function binding(profile: UserProfile): Json {
  return { stripeCustomerId: profile.stripeCustomerId, stripeSubscriptionId: profile.stripeSubscriptionId }
}
function fingerprint(profile: UserProfile): string {
  return hash({ binding: binding(profile), version: profile.billingAccessVersion,
    owner: profile.pendingTrialOperationId, customer: profile.pendingBillingMutationId })
}
function safeResponse(action: TenantBillingMutationAction, value: unknown): Json {
  switch (action) {
    case "customer_create": return z.object({}).strict().parse(value)
    case "checkout_create": case "portal_create": case "cancel_portal_create": case "upgrade":
      return z.object({ url: z.url() }).strict().parse(value)
    case "schedule_downgrade": return z.object({ scheduledAt: z.iso.datetime() }).strict().parse(value)
    case "undo_downgrade": return z.object({ cancelled: z.literal(true) }).strict().parse(value)
    case "cancel": return z.object({ redirectUrl: z.url() }).strict().parse(value)
  }
}
function assertResultReferences(stepKey: string, refs: ProviderReferences): void {
  const required: (keyof ProviderReferences)[] = ["stripeCustomerId"]
  if (["checkout_create", "portal_create", "cancel_portal_create"].includes(stepKey)) required.push("stripeSessionId")
  if (["upgrade", "schedule_create", "schedule_phase_update", "schedule_release"].includes(stepKey)) required.push("stripeSubscriptionId")
  if (["schedule_create", "schedule_phase_update", "schedule_release"].includes(stepKey)) required.push("stripeScheduleId")
  if (required.some((key) => !refs[key])) return fail("billing_step_evidence_missing")
}

/**
 * Server-only privileged billing exception: routes retain authenticated RLS
 * ownership reads. This service never accepts billing-column patches. Injected
 * transaction/clock are for mocked tests; production uses the canonical admin DB.
 * No provider MUTATION is permitted inside a transaction or verification callback.
 */
export function createTenantBillingMutationCoordinator(dependencies?: {
  transaction: Transaction; now: () => Date;
}) {
  const transaction: Transaction = dependencies?.transaction ?? ((run) => prismaAdmin.$transaction(run, { timeout: 20000 }))
  const now = dependencies?.now ?? (() => new Date())

  async function locked<T>(userId: string, run: (tx: Prisma.TransactionClient, profile: UserProfile) => Promise<T>): Promise<T> {
    return transaction(async (tx) => {
      await lockTenantBilling(tx, userId)
      const profile = await tx.userProfile.findUnique({ where: { userId } })
      if (!profile) return fail("billing_profile_missing")
      return run(tx, profile)
    })
  }
  async function getOperation(tx: Prisma.TransactionClient, userId: string, operationId: string): Promise<TenantBillingMutation> {
    const op = await tx.tenantBillingMutation.findUnique({ where: { id: uuid.parse(operationId) } })
    if (!op || op.userId !== userId || op.actorUserId !== userId) return fail("billing_operation_not_found")
    return op
  }
  async function owned(tx: Prisma.TransactionClient, profile: UserProfile, fence: CustomerBillingFence): Promise<TenantBillingMutation> {
    if (fence.kind !== "customer") return fail("billing_fence_invalid")
    await assertBillingFence(tx, profile, fence, now())
    return getOperation(tx, profile.userId, fence.operationId)
  }
  async function steps(tx: Prisma.TransactionClient, op: TenantBillingMutation): Promise<TenantBillingMutationStep[]> {
    return tx.tenantBillingMutationStep.findMany({ where: { userId: op.userId, mutationId: op.id }, orderBy: { sequence: "asc" } })
  }
  function validSteps(op: TenantBillingMutation, rows: TenantBillingMutationStep[]): void {
    const keys = BILLING_MUTATION_STEPS[op.action]
    if (rows.length > keys.length || rows.some((step, index) =>
      step.userId !== op.userId || step.mutationId !== op.id || step.sequence !== index || step.stepKey !== keys[index] ||
      step.requestHash !== hash(step.normalizedRequest) || step.stripeIdempotencyKey !== `billing/${op.id}/${step.stepKey}` ||
      step.method !== "POST" || !step.objectTarget)) return fail("billing_step_conflict")
  }
  function evidence(op: TenantBillingMutation, step: TenantBillingMutationStep): z.infer<typeof proofSchema> {
    const proof = proofSchema.parse(step.providerResult)
    if (!step.firstAttemptAt || proof.mutationId !== op.id || proof.stepKey !== step.stepKey || proof.requestHash !== step.requestHash ||
        (proof.outcome === "succeeded" ? step.status !== "succeeded" : step.status !== "failed") ||
      (proof.outcome === "succeeded" ? proof.failureCode !== null : !proof.failureCode) ||
        proof.failureCode !== step.failureCode || Object.entries(proof.refs).some(([key, value]) => step[key as keyof TenantBillingMutationStep] !== value)) {
      return fail("billing_step_evidence_missing")
    }
    if (proof.outcome === "succeeded") assertResultReferences(step.stepKey, proof.refs)
    return proof
  }
  async function addStep(tx: Prisma.TransactionClient, op: TenantBillingMutation, input: BillingStepInput): Promise<TenantBillingMutationStep> {
    const spec = stepInput.parse(input), rows = await steps(tx, op)
    validSteps(op, rows)
    const existing = rows.find((row) => row.stepKey === spec.stepKey)
    if (existing) {
      if (existing.requestHash !== hash(spec.normalizedRequest) || existing.method !== spec.method || existing.objectTarget !== spec.objectTarget) {
        return fail("billing_step_conflict")
      }
      return existing
    }
    if (BILLING_MUTATION_STEPS[op.action][rows.length] !== spec.stepKey || rows.some((row) => row.status !== "succeeded")) {
      return fail("billing_step_order_conflict")
    }
    for (const row of rows) evidence(op, row)
    return tx.tenantBillingMutationStep.create({ data: {
      userId: op.userId, mutationId: op.id, stepKey: spec.stepKey, sequence: rows.length,
      normalizedRequest: dbJson(spec.normalizedRequest), requestHash: hash(spec.normalizedRequest),
      method: spec.method, objectTarget: spec.objectTarget, stripeIdempotencyKey: `billing/${op.id}/${spec.stepKey}`,
    } })
  }
  async function createOperation(
    tx: Prisma.TransactionClient, profile: UserProfile, input: CustomerBillingReservationInput,
    id: string, action: TenantBillingMutationAction, intent: Json, parentMutationId: string | null,
  ): Promise<TenantBillingMutation> {
    // Cross-journal collisions are rejected too; never reinterpret an owner UUID.
    if (await tx.tenantTrialOperation.findUnique({ where: { id } })) return fail("billing_operation_key_conflict")
    return tx.tenantBillingMutation.create({ data: {
      id, userId: input.userId, actorUserId: input.actorUserId, action,
      inputHash: billingMutationInputHash(action, intent), normalizedInput: dbJson(intent),
      startingVersion: profile.billingAccessVersion, startingBinding: dbJson(binding(profile)),
      startingFingerprint: fingerprint(profile), parentMutationId,
      stripeCustomerId: profile.stripeCustomerId, stripeSubscriptionId: profile.stripeSubscriptionId,
    } })
  }

  async function reserve(input: CustomerBillingReservationInput): Promise<{
    operation: TenantBillingMutation; reservedOperationId: string | null; replay: boolean;
  }> {
    const request = reservationInput.parse(input)
    if (request.actorUserId !== request.userId || request.action === "customer_create" ||
        request.inputHash !== billingMutationInputHash(request.action, request.normalizedInput)) return fail("billing_operation_key_conflict")
    return locked(request.userId, async (tx, profile) => {
      const prior = await tx.tenantBillingMutation.findUnique({ where: { id: request.operationId } })
      // Identity replay precedes today's optimistic version/config checks.
      if (prior) {
        if (prior.userId !== request.userId || prior.actorUserId !== request.actorUserId || prior.action !== request.action ||
            prior.inputHash !== request.inputHash || prior.parentMutationId !== null ||
            hash(prior.normalizedInput) !== hash(request.normalizedInput)) return fail("billing_operation_key_conflict")
        let reservedOperationId: string | null = null
        if (unresolved(prior.status)) {
          if (profile.pendingTrialOperationId !== null || !profile.pendingBillingMutationId) return fail("billing_mutation_in_progress")
          const reserved = await getOperation(tx, request.userId, profile.pendingBillingMutationId)
          if (!unresolved(reserved.status) || (reserved.id !== prior.id &&
              (reserved.parentMutationId !== prior.id || reserved.action !== "customer_create" || reserved.id !== billingCustomerPrerequisiteId(prior.id)))) {
            return fail("billing_mutation_in_progress")
          }
          reservedOperationId = reserved.id
        }
        return { operation: prior, reservedOperationId, replay: true }
      }
      assertBillingReservation(profile)
      if (request.expectedVersion !== profile.billingAccessVersion) return fail("billing_version_conflict")
      if (profile.stripeCustomerId && await tx.userProfile.findFirst({ where: {
        stripeCustomerId: profile.stripeCustomerId, NOT: { userId: profile.userId },
      } })) return fail("billing_binding_conflict")
      const prerequisite = request.customerPrerequisite
      if (prerequisite && (profile.stripeCustomerId || !["checkout_create", "portal_create"].includes(request.action) || request.steps.length)) {
        return fail("billing_prerequisite_conflict")
      }
      if (!prerequisite && request.action !== "cancel" && (!profile.stripeCustomerId || request.steps.length !== 1)) {
        return fail("billing_steps_required")
      }
      if (request.action === "cancel" && request.steps.length) return fail("billing_step_conflict")
      let root = await createOperation(tx, profile, request, request.operationId, request.action, request.normalizedInput, null)
      let reserved = root
      if (prerequisite) {
        const childId = billingCustomerPrerequisiteId(root.id)
        if (await tx.tenantBillingMutation.findUnique({ where: { id: childId } })) return fail("billing_operation_key_conflict")
        reserved = await createOperation(tx, profile, request, childId, "customer_create", prerequisite.normalizedInput, root.id)
        await addStep(tx, reserved, prerequisite.step)
      } else {
        for (const step of request.steps) await addStep(tx, root, step)
      }
      const executionVersion = profile.billingAccessVersion + 1
      const updated = await tx.tenantBillingMutation.update({ where: { id: reserved.id }, data: { executionVersion } })
      if (root.id === reserved.id) root = updated
      await tx.userProfile.update({ where: { userId: profile.userId }, data: {
        pendingBillingMutationId: reserved.id, billingAccessVersion: { increment: 1 },
      } })
      return { operation: root, reservedOperationId: reserved.id, replay: false }
    })
  }

  async function claim(userId: string, operationId: string, leaseOwner: string): Promise<CustomerBillingFence> {
    z.string().min(1).max(200).parse(leaseOwner)
    return locked(userId, async (tx, profile) => {
      const op = await getOperation(tx, userId, operationId)
      const fence: CustomerBillingFence = { kind: "customer", operationId: op.id, leaseOwner,
        fencingToken: op.fencingToken + 1, executionVersion: op.executionVersion ?? 0 }
      assertBillingReservation(profile, fence)
      if (!unresolved(op.status) || op.executionVersion === null || op.stripeCustomerId !== profile.stripeCustomerId ||
          op.stripeSubscriptionId !== profile.stripeSubscriptionId) return fail("billing_mutation_fence_lost")
      // Even the SAME lease owner cannot take a second live lease/token.
      if (op.leaseExpiresAt && op.leaseExpiresAt > now()) return fail("billing_execution_in_progress")
      const claimed = await tx.tenantBillingMutation.updateMany({ where: {
        id: op.id, userId, actorUserId: userId, fencingToken: op.fencingToken, status: op.status,
      }, data: { leaseOwner, leaseExpiresAt: new Date(now().getTime() + 60000), fencingToken: { increment: 1 } } })
      if (claimed.count !== 1) return fail("billing_mutation_fence_lost")
      return fence
    })
  }

  async function freezeStep(userId: string, fence: CustomerBillingFence, input: BillingStepInput): Promise<TenantBillingMutationStep> {
    return locked(userId, async (tx, profile) => {
      const op = await owned(tx, profile, fence)
      const step = await addStep(tx, op, input)
      await assertBillingFence(tx, profile, fence, now())
      return step
    })
  }

  /** Internal server adapter reads, not public status/recovery endpoints. */
  async function findAccepted(userId: string, operationId: string): Promise<TenantBillingMutation | null> {
    return locked(userId, async (tx) => {
      const op = await tx.tenantBillingMutation.findUnique({ where: { id: uuid.parse(operationId) } })
      if (!op) return null
      if (op.userId !== userId || op.actorUserId !== userId || op.parentMutationId) return fail("billing_operation_key_conflict")
      return op
    })
  }

  async function inspect(userId: string, fence: CustomerBillingFence): Promise<{
    operation: TenantBillingMutation; profile: UserProfile; steps: TenantBillingMutationStep[];
  }> {
    return locked(userId, async (tx, profile) => {
      const operation = await owned(tx, profile, fence), rows = await steps(tx, operation)
      validSteps(operation, rows)
      for (const step of rows.filter((row) => row.status === "succeeded" || row.status === "failed")) evidence(operation, step)
      return structuredClone({ operation, profile, steps: rows })
    })
  }

  /** Scoped server journal read only; callers must first authenticate and read their profile through RLS. */
  async function readOwn(userId: string, operationId: string): Promise<{
    operation: TenantBillingMutation; profile: UserProfile;
    reserved: TenantBillingMutation | null; steps: TenantBillingMutationStep[]; hasSuccessfulPrerequisite: boolean;
  }> {
    return locked(userId, async (tx, profile) => {
      const operation = await getOperation(tx, userId, operationId)
      // Prerequisites are internal to their originating root, not independent public operations.
      if (operation.parentMutationId || operation.action === "customer_create") return fail("billing_operation_not_found")
      let reserved: TenantBillingMutation | null = null
      if (unresolved(operation.status) && profile.pendingBillingMutationId && !profile.pendingTrialOperationId) {
        const candidate = await getOperation(tx, userId, profile.pendingBillingMutationId)
        if (candidate.id === operation.id || (candidate.action === "customer_create" &&
            candidate.parentMutationId === operation.id && candidate.id === billingCustomerPrerequisiteId(operation.id))) reserved = candidate
      }
      const rows = await steps(tx, reserved ?? operation)
      validSteps(reserved ?? operation, rows)
      for (const step of rows.filter((row) => row.status === "succeeded" || row.status === "failed")) evidence(reserved ?? operation, step)
      const children = await tx.tenantBillingMutation.findMany({ where: { userId, parentMutationId: operation.id } })
      return structuredClone({ operation, profile, reserved, steps: rows,
        hasSuccessfulPrerequisite: children.some((child) => child.status === "succeeded") })
    })
  }

  async function uncertain(userId: string, fence: CustomerBillingFence, stepKey: string): Promise<void> {
    await locked(userId, async (tx, profile) => {
      const op = await owned(tx, profile, fence), rows = await steps(tx, op)
      validSteps(op, rows)
      const step = rows.find((row) => row.stepKey === stepKey)
      if (!step?.firstAttemptAt || !unresolved(step.status)) return fail("billing_step_conflict")
      await tx.tenantBillingMutationStep.update({ where: { id: step.id }, data: { status: "reconciliation_required" } })
      await tx.tenantBillingMutation.update({ where: { id: op.id }, data: { status: "reconciliation_required" } })
    })
  }

  async function dispatch<T>(userId: string, fence: CustomerBillingFence, stepKey: string,
    mutate: (step: Readonly<TenantBillingMutationStep>) => Promise<T>): Promise<T> {
    // The only dispatch entry point: resolve the transaction (including COMMIT)
    // before invoking a provider mutation. A forged fence alone grants nothing.
    const accepted = await locked(userId, async (tx, profile) => {
      const op = await owned(tx, profile, fence), rows = await steps(tx, op)
      validSteps(op, rows)
      const step = rows.find((row) => row.stepKey === stepKey)
      if (!step || !unresolved(step.status) || rows.slice(0, step.sequence).some((row) => row.status !== "succeeded")) {
        return fail("billing_step_order_conflict")
      }
      for (const row of rows.slice(0, step.sequence)) evidence(op, row)
      const attemptAt = now()
      if (step.firstAttemptAt && attemptAt.getTime() >= step.firstAttemptAt.getTime() + 86400000) {
        return fail("billing_step_replay_window_expired")
      }
      await tx.tenantBillingMutation.update({ where: { id: op.id }, data: {
        attempts: { increment: 1 }, firstAttemptAt: op.firstAttemptAt ?? attemptAt, lastAttemptAt: attemptAt,
      } })
      const frozen = await tx.tenantBillingMutationStep.update({ where: { id: step.id }, data: {
        attempts: { increment: 1 }, firstAttemptAt: step.firstAttemptAt ?? attemptAt, lastAttemptAt: attemptAt,
      } })
      return { frozen, leaseExpiresAt: op.leaseExpiresAt! }
    })
    if (accepted.leaseExpiresAt <= now()) return fail("billing_mutation_fence_lost")
    try { return await mutate(structuredClone(accepted.frozen)) }
    catch (error) {
      // Never infer nonexecution from a throw (including cached provider 500).
      // If persistence/fencing is unavailable the original pending row survives.
      try { await uncertain(userId, fence, stepKey) } catch { /* durable pending remains recoverable */ }
      throw error
    }
  }

  async function recordStep(userId: string, fence: CustomerBillingFence, stepKey: string,
    verify: (context: VerificationContext) => Promise<BillingStepVerification>): Promise<void> {
    await locked(userId, async (tx, profile) => {
      const op = await owned(tx, profile, fence), rows = await steps(tx, op)
      validSteps(op, rows)
      const step = rows.find((row) => row.stepKey === stepKey)
      if (!step?.firstAttemptAt || !unresolved(step.status) || rows.slice(0, step.sequence).some((row) => row.status !== "succeeded")) {
        return fail("billing_step_conflict")
      }
      for (const row of rows.slice(0, step.sequence)) evidence(op, row)
      // Trusted action-specific READ/verification adapter (task 3.11), never a
      // request-body patch or a caller-supplied terminal status/projection.
      const outcome = await verify(structuredClone({ operation: op, step, profile }))
      await assertBillingFence(tx, profile, fence, now())
      const refs = outcome.kind === "succeeded" ? refsSchema.parse(outcome.refs) : {}
      if ((profile.stripeCustomerId && refs.stripeCustomerId && refs.stripeCustomerId !== profile.stripeCustomerId) ||
          (profile.stripeSubscriptionId && refs.stripeSubscriptionId && refs.stripeSubscriptionId !== profile.stripeSubscriptionId)) {
        return fail("billing_binding_conflict")
      }
      if (outcome.kind === "succeeded") assertResultReferences(stepKey, refs)
      const failureCode = outcome.kind === "rejected" ? z.string().regex(/^[a-z0-9_]{1,100}$/).parse(outcome.failureCode) : null
      const proof = proofSchema.parse({ mutationId: op.id, stepKey, requestHash: step.requestHash,
        proof: outcome.proof, refs, outcome: outcome.kind, failureCode,
        ...(outcome.kind === "succeeded" && outcome.safeResponse !== undefined
          ? { safeResponse: safeResponse(op.action, outcome.safeResponse) } : {}),
      })
      await tx.tenantBillingMutationStep.update({ where: { id: step.id }, data: {
        status: outcome.kind === "succeeded" ? "succeeded" : "failed", ...refs,
        providerResult: dbJson(proof as Json), failureCode, completedAt: now(),
      } })
      await tx.tenantBillingMutation.update({ where: { id: op.id }, data: {
        // Operation customer/subscription IDs are the EXECUTION binding, not
        // returned object IDs. A customer-create result must not replace that
        // binding before the atomic child/root handoff.
        stripeSessionId: refs.stripeSessionId, stripeScheduleId: refs.stripeScheduleId,
        stripeRequestId: refs.stripeRequestId, status: "reconciliation_required",
      } })
    })
  }

  async function verifyCustomer(stripe: Stripe, tx: Prisma.TransactionClient, profile: UserProfile, customerId: string,
    createdOperationId?: string): Promise<void> {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted || customer.id !== customerId ||
        (customer.metadata.userId && customer.metadata.userId !== profile.userId) ||
        (customer.metadata.user_id && customer.metadata.user_id !== profile.userId) ||
        (createdOperationId && (customer.metadata.userId !== profile.userId || customer.metadata.operationId !== createdOperationId))) {
      return fail("billing_customer_evidence_conflict")
    }
    const other = await tx.userProfile.findFirst({ where: { stripeCustomerId: customerId, NOT: { userId: profile.userId } } })
    if (other) return fail("billing_binding_conflict")
  }

  async function handoff(stripe: Stripe, userId: string, fence: CustomerBillingFence): Promise<TenantBillingMutation> {
    return locked(userId, async (tx, profile) => {
      const child = await owned(tx, profile, fence), rows = await steps(tx, child)
      validSteps(child, rows)
      if (child.action !== "customer_create" || !child.parentMutationId || rows.length !== 1 || rows[0].status !== "succeeded") {
        return fail("billing_prerequisite_conflict")
      }
      const proof = evidence(child, rows[0]), customerId = proof.refs.stripeCustomerId
      if (!customerId || profile.stripeCustomerId || profile.stripeSubscriptionId) return fail("billing_binding_conflict")
      const root = await getOperation(tx, userId, child.parentMutationId)
      if (!unresolved(root.status) || root.parentMutationId || root.executionVersion !== null ||
          !["checkout_create", "portal_create"].includes(root.action) || child.id !== billingCustomerPrerequisiteId(root.id)) {
        return fail("billing_prerequisite_conflict")
      }
      await verifyCustomer(stripe, tx, profile, customerId, child.id)
      // Child binding is still the pre-call binding until this atomic commit.
      // recordStep stores result refs, so customer-create ownership CAS below
      // uses the starting binding rather than the returned customer ID.
      await assertBillingFence(tx, profile, fence, now())
      await tx.tenantBillingMutation.update({ where: { id: child.id }, data: {
        status: "succeeded", result: {}, providerResult: dbJson(proof as Json),
        stripeCustomerId: customerId, completedAt: now(), leaseOwner: null, leaseExpiresAt: null,
      } })
      const executionVersion = profile.billingAccessVersion + 1
      const updated = await tx.tenantBillingMutation.update({ where: { id: root.id }, data: { stripeCustomerId: customerId, executionVersion } })
      await tx.userProfile.update({ where: { userId }, data: {
        stripeCustomerId: customerId, pendingBillingMutationId: root.id, billingAccessVersion: { increment: 1 },
      } })
      return updated
    })
  }

  async function bindDiscoveredSubscription(stripe: Stripe, userId: string, fence: CustomerBillingFence,
    subscriptionId: string): Promise<CustomerBillingFence> {
    return locked(userId, async (tx, profile) => {
      const op = await owned(tx, profile, fence)
      if (op.parentMutationId || !profile.stripeCustomerId || profile.stripeSubscriptionId ||
          !["upgrade", "cancel_portal_create", "schedule_downgrade"].includes(op.action)) return fail("billing_binding_conflict")
      const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, subscriptionId)
      const current = reconcileStripeSubscription(subscription, { subscriptionId, binding: profile,
        priceTier: frozenBillingPriceTier(op.normalizedInput) })
      if (current.kind !== "current" || current.snapshot.customerId !== profile.stripeCustomerId) return fail("billing_binding_conflict")
      await assertBillingFence(tx, profile, fence, now())
      const executionVersion = profile.billingAccessVersion + 1
      await tx.tenantBillingMutation.update({ where: { id: op.id }, data: { stripeSubscriptionId: subscriptionId, executionVersion } })
      await tx.userProfile.update({ where: { userId }, data: {
        ...stripeSnapshotProfileData(current.snapshot), billingAccessVersion: { increment: 1 },
      } })
      return { ...fence, executionVersion }
    })
  }

  async function finalize(stripe: Stripe, userId: string, fence: CustomerBillingFence): Promise<TenantBillingMutation> {
    return locked(userId, async (tx, profile) => {
      const op = await owned(tx, profile, fence), rows = await steps(tx, op)
      validSteps(op, rows)
      const proofs = rows.filter((row) => row.status === "succeeded" || row.status === "failed").map((row) => evidence(op, row))
      const children = await tx.tenantBillingMutation.findMany({ where: { userId, parentMutationId: op.id } })
      if (children.some((child) => child.status !== "succeeded")) return fail("billing_prerequisite_conflict")
      const rejected = rows.some((row) => row.status === "failed")
      // Known failure after ANY successful effect is still a partial operation.
      if (rejected && (children.length || rows.some((row) => row.status === "succeeded"))) return fail("billing_partial_outcome")
      if (rows.some((row) => row.firstAttemptAt && unresolved(row.status))) return fail("billing_outcome_unknown")
      if (!rejected && (rows.length !== BILLING_MUTATION_STEPS[op.action].length || rows.some((row) => row.status !== "succeeded"))) {
        return fail("billing_step_evidence_missing")
      }
      if (op.parentMutationId && !rejected) return fail("billing_prerequisite_requires_handoff")
      let projection: Prisma.UserProfileUpdateInput = {}
      if (!rejected) {
        if (op.action === "cancel") {
          if (profile.stripeSubscriptionId || profile.subscriptionStatus !== "trialing") return fail("billing_local_cancel_conflict")
          projection = { subscriptionStatus: "canceled", subscriptionTier: DEFAULT_SUBSCRIPTION_TIER,
            trialEndsAt: null, subscriptionCancelAt: null, pendingDowngradeTier: null, stripeScheduleId: null }
        } else {
          if (!profile.stripeCustomerId) return fail("billing_binding_conflict")
          await verifyCustomer(stripe, tx, profile, profile.stripeCustomerId)
          if (profile.stripeSubscriptionId) {
            const subscription = await retrieveSubscriptionWithLatestInvoice(stripe, profile.stripeSubscriptionId)
            const current = reconcileStripeSubscription(subscription, { subscriptionId: profile.stripeSubscriptionId, binding: profile,
              priceTier: frozenBillingPriceTier(op.normalizedInput) })
            if (current.kind !== "current") return fail("billing_binding_conflict")
            projection = stripeSnapshotProfileData(current.snapshot)
          }
          if (op.action === "schedule_downgrade" || op.action === "undo_downgrade") {
            const scheduleId = rows.at(-1)?.stripeScheduleId
            if (!scheduleId) return fail("billing_step_evidence_missing")
            const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId)
            if (schedule.id !== scheduleId || stripeObjectId(schedule.customer) !== profile.stripeCustomerId) return fail("billing_binding_conflict")
            if (op.action === "undo_downgrade") {
              if (profile.stripeScheduleId !== scheduleId || schedule.status !== "released" ||
                  stripeObjectId(schedule.released_subscription) !== profile.stripeSubscriptionId) return fail("billing_schedule_evidence_conflict")
              projection = { ...projection, stripeScheduleId: null, pendingDowngradeTier: null }
            } else {
              if (stripeObjectId(schedule.subscription) !== profile.stripeSubscriptionId || !["active", "not_started"].includes(schedule.status) ||
                  schedule.phases.length !== 2 || schedule.phases[1].items.length !== 1) return fail("billing_schedule_evidence_conflict")
              const priceId = stripeObjectId(schedule.phases[1].items[0].price)
              if (!priceId) return fail("billing_schedule_evidence_conflict")
              projection = { ...projection, stripeScheduleId: scheduleId,
                pendingDowngradeTier: (frozenBillingPriceTier(op.normalizedInput) ?? stripeTierForPrice)(priceId) }
            }
          }
        }
      }
      await assertBillingFence(tx, profile, fence, now())
      const failureCode = rows.find((row) => row.status === "failed")?.failureCode
      const result = rejected ? { error: failureCode ?? "provider_rejected" } : safeResponse(op.action,
        op.action === "cancel" ? { redirectUrl: z.object({ redirectUrl: z.url() }).parse(op.normalizedInput).redirectUrl } : proofs.at(-1)?.safeResponse)
      const finished = await tx.tenantBillingMutation.update({ where: { id: op.id }, data: {
        status: rejected ? "failed" : "succeeded", result: dbJson(result),
        providerResult: dbJson(proofs as Json), failureCode: failureCode ?? null,
        completedAt: now(), leaseOwner: null, leaseExpiresAt: null,
      } })
      if (op.parentMutationId) {
        const root = await getOperation(tx, userId, op.parentMutationId)
        if (!unresolved(root.status) || root.executionVersion !== null || root.parentMutationId ||
            op.action !== "customer_create" || op.id !== billingCustomerPrerequisiteId(root.id)) return fail("billing_prerequisite_conflict")
        await tx.tenantBillingMutation.update({ where: { id: root.id }, data: {
          status: "failed", result: dbJson(result), failureCode: failureCode ?? "provider_rejected",
          providerResult: dbJson({ prerequisiteId: op.id, evidence: proofs as Json }), completedAt: now(),
        } })
      }
      await tx.userProfile.update({ where: { userId }, data: {
        ...projection, pendingBillingMutationId: null, billingAccessVersion: { increment: 1 },
      } })
      return finished
    })
  }

  /** Recovery-only terminal proof path, NEVER a dispatch fence or a binding patch.
   * The normal fence intentionally cannot claim an obsolete binding. Under the same
   * tenant lock, claim a fresh token ONLY when every effect already has durable
   * successful proof, and verify that a different current subscription genuinely
   * superseded the old (now ended) subscription. Unknown/partial creates cannot enter.
   */
  async function supersedeKnown(stripe: Stripe, userId: string, operationId: string, leaseOwner: string): Promise<TenantBillingMutation> {
    z.string().min(1).max(200).parse(leaseOwner)
    return locked(userId, async (tx, profile) => {
      const op = await getOperation(tx, userId, operationId), rows = await steps(tx, op)
      const fence: CustomerBillingFence = { kind: "customer", operationId: op.id, leaseOwner,
        fencingToken: op.fencingToken + 1, executionVersion: op.executionVersion ?? 0 }
      assertBillingReservation(profile, fence)
      if (!unresolved(op.status) || op.parentMutationId || op.executionVersion === null ||
          !["upgrade", "schedule_downgrade", "undo_downgrade"].includes(op.action) ||
          !op.stripeCustomerId || op.stripeCustomerId !== profile.stripeCustomerId ||
          !op.stripeSubscriptionId || !profile.stripeSubscriptionId || op.stripeSubscriptionId === profile.stripeSubscriptionId) {
        return fail("billing_outcome_unknown")
      }
      if (op.leaseExpiresAt && op.leaseExpiresAt > now()) return fail("billing_execution_in_progress")
      validSteps(op, rows)
      if (rows.length !== BILLING_MUTATION_STEPS[op.action].length || rows.some((row) => row.status !== "succeeded")) return fail("billing_outcome_unknown")
      const proofs = rows.map((row) => evidence(op, row))
        if (proofs.some((proof) => proof.refs.stripeCustomerId !== op.stripeCustomerId ||
          proof.refs.stripeSubscriptionId !== op.stripeSubscriptionId)) return fail("billing_outcome_unknown")
      const children = await tx.tenantBillingMutation.findMany({ where: { userId, parentMutationId: op.id } })
      if (children.some((child) => child.status !== "succeeded")) return fail("billing_outcome_unknown")
      const claim = await tx.tenantBillingMutation.updateMany({ where: {
        id: op.id, userId, actorUserId: userId, status: op.status, fencingToken: op.fencingToken,
        executionVersion: op.executionVersion,
        stripeCustomerId: op.stripeCustomerId, stripeSubscriptionId: op.stripeSubscriptionId,
      }, data: { leaseOwner, leaseExpiresAt: new Date(now().getTime() + 60000), fencingToken: { increment: 1 } } })
      if (claim.count !== 1) return fail("billing_mutation_fence_lost")
      await verifyCustomer(stripe, tx, profile, op.stripeCustomerId)
      const previous = await retrieveSubscriptionWithLatestInvoice(stripe, op.stripeSubscriptionId)
      const current = await retrieveSubscriptionWithLatestInvoice(stripe, profile.stripeSubscriptionId)
      const previousMapping = reconcileStripeSubscription(previous, { subscriptionId: op.stripeSubscriptionId,
        binding: { ...profile, stripeSubscriptionId: op.stripeSubscriptionId }, priceTier: frozenBillingPriceTier(op.normalizedInput) })
      const currentMapping = reconcileStripeSubscription(current, { subscriptionId: profile.stripeSubscriptionId, binding: profile,
        priceTier: frozenBillingPriceTier(op.normalizedInput) })
      if (previousMapping.kind !== "current" || currentMapping.kind !== "current" ||
          !["canceled", "incomplete_expired"].includes(previous.status) ||
          ["canceled", "incomplete_expired"].includes(current.status) ||
          previousMapping.snapshot.customerId !== profile.stripeCustomerId || currentMapping.snapshot.customerId !== profile.stripeCustomerId) {
        return fail("billing_outcome_unknown")
      }
      // CAS the historical execution binding, not today's different subscription.
      // This narrow terminal-only token is never returned to any provider executor.
      const committed = await tx.tenantBillingMutation.updateMany({ where: {
        id: op.id, userId, actorUserId: userId, status: op.status, leaseOwner,
        fencingToken: fence.fencingToken, leaseExpiresAt: { gt: now() },
        executionVersion: op.executionVersion,
        stripeCustomerId: op.stripeCustomerId, stripeSubscriptionId: op.stripeSubscriptionId,
      }, data: { status: "superseded", result: dbJson(safeResponse(op.action, proofs.at(-1)?.safeResponse)),
        providerResult: dbJson({ steps: proofs as Json, supersession: {
          previousSubscriptionId: previous.id, currentSubscriptionId: current.id,
          previousStatus: previous.status, currentStatus: current.status,
        } }), completedAt: now(), leaseOwner: null, leaseExpiresAt: null } })
      if (committed.count !== 1) return fail("billing_mutation_fence_lost")
      await tx.userProfile.update({ where: { userId }, data: { pendingBillingMutationId: null, billingAccessVersion: { increment: 1 } } })
      return getOperation(tx, userId, op.id)
    })
  }
  return { reserve, claim, freezeStep, dispatch, recordStep, uncertain, handoff, bindDiscoveredSubscription, finalize, findAccepted, inspect, readOwn, supersedeKnown }
}

export const tenantBillingMutations = createTenantBillingMutationCoordinator()