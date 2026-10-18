import "server-only"
import type { Prisma, UserProfile } from "@/lib/generated/prisma/client"

export type OwnerBillingFence = Readonly<{
  kind: "owner"; operationId: string; leaseOwner: string; fencingToken: number;
}>
export type CustomerBillingFence = Readonly<{
  kind: "customer"; operationId: string; leaseOwner: string; fencingToken: number;
  executionVersion: number;
}>
export type TenantBillingFence = OwnerBillingFence | CustomerBillingFence

export class TenantBillingConflictError extends Error {
  constructor(readonly code: string) { super(code); this.name = "TenantBillingConflictError" }
}

/** Fail closed even for read-only direct callbacks and incomplete profile selects. */
export function assertBillingReservation(profile: UserProfile, fence?: TenantBillingFence): void {
  if (fence && ((fence.kind !== "owner" && fence.kind !== "customer") ||
      !fence.operationId || !fence.leaseOwner || !Number.isSafeInteger(fence.fencingToken) || fence.fencingToken < 1 ||
      (fence.kind === "customer" && (!Number.isSafeInteger(fence.executionVersion) || fence.executionVersion < 0)))) {
    throw new TenantBillingConflictError("billing_fence_invalid")
  }
  if (profile.pendingTrialOperationId !== (fence?.kind === "owner" ? fence.operationId : null)) {
    throw new TenantBillingConflictError("trial_operation_in_progress")
  }
  if (profile.pendingBillingMutationId !== (fence?.kind === "customer" ? fence.operationId : null)) {
    throw new TenantBillingConflictError("billing_mutation_in_progress")
  }
}

/** Tenant lock MUST precede this row CAS. Recheck AFTER every provider observation. */
export async function assertBillingFence(
  tx: Prisma.TransactionClient, profile: UserProfile, fence: TenantBillingFence, now = new Date(),
): Promise<void> {
  assertBillingReservation(profile, fence)
  const where = {
    id: fence.operationId, userId: profile.userId, leaseOwner: fence.leaseOwner,
    fencingToken: fence.fencingToken, leaseExpiresAt: { gt: now },
    status: { in: ["pending", "reconciliation_required"] as ("pending" | "reconciliation_required")[] },
    stripeCustomerId: profile.stripeCustomerId, stripeSubscriptionId: profile.stripeSubscriptionId,
  }
  const owned = fence.kind === "owner"
    ? await tx.tenantTrialOperation.updateMany({ where, data: { fencingToken: fence.fencingToken } })
    : await tx.tenantBillingMutation.updateMany({
      where: { ...where, actorUserId: profile.userId, executionVersion: fence.executionVersion },
      data: { fencingToken: fence.fencingToken },
    })
  if (owned.count !== 1) throw new TenantBillingConflictError(
    fence.kind === "owner" ? "trial_operation_fence_lost" : "billing_mutation_fence_lost",
  )
}