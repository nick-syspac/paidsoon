import "server-only"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { BILLING_MUTATION_STEPS, tenantBillingMutations } from "@/lib/billing/tenantBillingMutationCoordinator"
import { customerBillingExecutors } from "@/lib/billing/customerBillingExecutors"
import { TenantBillingConflictError } from "@/lib/billing/tenantBillingFence"

type State = Awaited<ReturnType<typeof tenantBillingMutations.readOwn>>
const unresolved = (status: string): boolean => ["pending", "reconciliation_required"].includes(status)
const url = z.object({ url: z.url() }).strict()
type SafeResult = Record<string, string | boolean>
export type CustomerBillingOperationStatus = {
  operationId: string; action: State["operation"]["action"]; status: State["operation"]["status"];
  result: SafeResult | null; failureCode: "billing_provider_rejected" | null;
  reconciliationRequired: boolean; canReconcile: boolean;
  createdAt: string; completedAt: string | null; statusUrl: string;
}
type ReconcileResult = { httpStatus: number; body: CustomerBillingOperationStatus | SafeResult }
type OperationsService = {
  start: (input: Parameters<typeof customerBillingExecutors.accept>[0]) => Promise<ReconcileResult>;
  status: (userId: string, operationId: string) => Promise<CustomerBillingOperationStatus>;
  reconcile: (userId: string, operationId: string) => Promise<ReconcileResult>;
}

/** Explicit allowlist even for stored results: never serialize a journal row or provider proof. */
export function projectCustomerBillingOperation(state: State, now = new Date()): CustomerBillingOperationStatus {
  const { operation: op, reserved, profile, steps } = state
  let result: Record<string, string | boolean> | null = null
  if (op.status === "succeeded" || op.status === "superseded") {
    const schema = op.action === "cancel" ? z.object({ redirectUrl: z.url() }).strict()
      : op.action === "undo_downgrade" ? z.object({ cancelled: z.literal(true) }).strict()
      : op.action === "schedule_downgrade" ? z.object({ scheduledAt: z.iso.datetime() }).strict() : url
    const parsed = schema.safeParse(op.result)
    if (parsed.success) result = parsed.data
  }
  const current = steps.find((step) => step.status !== "succeeded")
  const partialRejection = current?.status === "failed" &&
    (state.hasSuccessfulPrerequisite || steps.some((step) => step.status === "succeeded"))
  const portalExpired = current && ["portal_create", "cancel_portal_create"].includes(current.stepKey) &&
    current.status !== "failed" && current.firstAttemptAt !== null && now.getTime() >= current.firstAttemptAt.getTime() + 86400000
  const knownObsoleteBinding = reserved?.id === op.id &&
    ["upgrade", "schedule_downgrade", "undo_downgrade"].includes(op.action) &&
    steps.length === BILLING_MUTATION_STEPS[op.action].length && steps.every((step) => step.status === "succeeded") &&
    reserved.stripeSubscriptionId !== null && profile.stripeSubscriptionId !== null
  const canReconcile = unresolved(op.status) && reserved !== null &&
    (!reserved.leaseExpiresAt || reserved.leaseExpiresAt <= now) &&
    reserved.stripeCustomerId === profile.stripeCustomerId &&
    (reserved.stripeSubscriptionId === profile.stripeSubscriptionId || knownObsoleteBinding) &&
    !partialRejection && !portalExpired
  return {
    operationId: op.id, action: op.action, status: op.status, result,
    failureCode: op.status === "failed" ? "billing_provider_rejected" : null,
    reconciliationRequired: unresolved(op.status), canReconcile,
    createdAt: op.createdAt.toISOString(), completedAt: op.completedAt?.toISOString() ?? null,
    statusUrl: `/api/billing/operations/${op.id}`,
  }
}

/** Narrow server-only journal exception. Authentication + RLS profile ownership precede these calls.
 * No admin journal, provider parameters, replacement keys or generic billing patches are accepted.
 */
export function createCustomerBillingOperations(dependencies?: {
  coordinator: typeof tenantBillingMutations; executors: typeof customerBillingExecutors; now: () => Date;
}): OperationsService {
  const coordinator = dependencies?.coordinator ?? tenantBillingMutations
  const executors = dependencies?.executors ?? customerBillingExecutors
  const now = dependencies?.now ?? (() => new Date())
  async function status(userId: string, operationId: string): Promise<CustomerBillingOperationStatus> {
    return projectCustomerBillingOperation(await coordinator.readOwn(userId, operationId), now())
  }
  async function outcome(userId: string, operationId: string): Promise<ReconcileResult> {
    const after = await status(userId, operationId)
    if (unresolved(after.status)) return { httpStatus: 202, body: after }
    if (after.status === "failed") return { httpStatus: 502, body: { error: "billing_provider_rejected" } }
    if (!after.result) throw new Error("billing_operation_result_unavailable")
    return { httpStatus: 200, body: after.result }
  }
  async function start(input: Parameters<typeof customerBillingExecutors.accept>[0]): Promise<ReconcileResult> {
    const accepted = await executors.accept(input)
    if (!accepted.replay && accepted.reservedOperationId) {
      try { await executors.execute(input.profile.userId, accepted.reservedOperationId, randomUUID()) }
      catch { /* Durable acceptance survives dispatch/verification/commit failure. Read safe state below. */ }
    }
    // Pending identical retries observe only; explicit reconciliation owns recovery.
    return outcome(input.profile.userId, input.operationId)
  }
  async function reconcile(userId: string, operationId: string): Promise<ReconcileResult> {
    const before = await coordinator.readOwn(userId, operationId)
    // Terminal replay is a pure read, including original failure/supersession. No claim/provider call.
    if (unresolved(before.operation.status)) {
      if (before.reserved?.leaseExpiresAt && before.reserved.leaseExpiresAt > now()) {
        throw new TenantBillingConflictError("billing_execution_in_progress")
      }
      try { await executors.recover(userId, operationId, randomUUID()) }
      catch (error) {
        if (error instanceof TenantBillingConflictError && error.code === "billing_execution_in_progress") throw error
        // Accepted intent survives every provider/verification/commit failure. Never invite a new create.
        // A fresh read below may itself fail: then report unavailable, not fabricated success/202 state.
      }
    }
    return outcome(userId, operationId)
  }
  return { start, status, reconcile }
}
export const customerBillingOperations = createCustomerBillingOperations()