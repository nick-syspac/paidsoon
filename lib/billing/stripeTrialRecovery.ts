import "server-only"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"
import type Stripe from "stripe"
import { z } from "zod"
import { requireAdminElevation, type AdminGuardContext } from "@/lib/admin/guard"
import { writeTrialAuditEvent } from "@/lib/admin/audit"
import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma, TenantTrialOperation, TenantTrialNotification, UserProfile } from "@/lib/generated/prisma/client"
import { lockTenantBilling } from "@/lib/billing/tenantBillingLock"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { assertTrialAccessOwner, TrialPreviewError } from "@/lib/billing/trialAccessPreview"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { trialOperationAuditSnapshot, type TrialOperationRequestContext } from "@/lib/billing/trialAccessOperations"
import { reconcileStripeSubscription, retrieveSubscriptionWithLatestInvoice, stripeSnapshotProfileData } from "@/lib/billing/stripeSubscriptions"
import {
  assertStripeTrialFence, assertStripeTrialIntent, claimStripeTrialRecovery, finalizeStripeTrialInTransaction,
  storedStripeTrialProof, stripeTrialResponseProof, STRIPE_TRIAL_RETENTION_MS, supportedStripeTrial, trialPending,
  type StripeTrialAuditContext,
} from "@/lib/billing/stripeTrialFinalization"
import type { StripeTrialExtensionOutcome } from "@/lib/billing/stripeTrialExtension"
import type { OwnerBillingFence } from "@/lib/billing/tenantBillingFence"
import { afterTrialAccessCommit, type TrialPostCommitDelivery } from "@/lib/email/trialAccessPostCommit"

type Transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
export interface StripeTrialRecoveryStatus {
  operationId: string
  source: "stripe_trial"
  status: TenantTrialOperation["status"]
  result: StripeTrialExtensionOutcome | null
  reconciliationRequired: boolean
  notificationStatus: TenantTrialNotification["status"]
}
export interface StripeTrialRecoveryService {
  status(userId: string, operationId: string): Promise<StripeTrialRecoveryStatus>
  reconcile(userId: string, operationId: string, raw: unknown, request: TrialOperationRequestContext): Promise<StripeTrialExtensionOutcome>
}
const fail = (code: string, status: 404 | 409 | 503 = 409): never => { throw new TrialPreviewError(code, status) }
function scoped(op: TenantTrialOperation | null, userId: string, owner: AdminGuardContext): TenantTrialOperation {
  // Only recovery/status omit the original SESSION comparison. Original ACTOR is immutable.
  if (!op || op.userId !== userId || op.actorUserId !== owner.userId || op.source !== "stripe_trial" ||
      op.action !== "extend_or_grant") return fail("trial_operation_not_found", 404)
  return op
}
function terminal(op: TenantTrialOperation): StripeTrialExtensionOutcome | null {
  if (!["succeeded", "failed"].includes(op.status)) return null
  if (!op.result) return fail("trial_operation_unavailable", 503)
  return structuredClone(op.result) as unknown as StripeTrialExtensionOutcome
}
function auditContext(op: TenantTrialOperation, owner: AdminGuardContext, request: TrialOperationRequestContext): StripeTrialAuditContext {
  return { operationId: op.id, operationAction: op.action, source: op.source, tenantId: op.userId, reason: op.reason,
    actor: { actorUserId: owner.userId, actorEmail: owner.userEmail, platformRole: "platform_owner",
      adminSessionId: owner.adminSession.id, adminDeviceId: owner.adminSession.adminDeviceId,
      ipAddress: request.ipAddress, userAgent: request.userAgent, requestId: request.requestId } }
}

/** Server-only owner exception: current active owner authority before every lookup.
 * One explicit recovery attempt, never a retry loop or a replacement intent/key.
 * Routes/same-origin transport are task 4.6; no unauthenticated dispatch seam. */
export function createStripeTrialRecoveryService(dependencies?: {
  transaction: Transaction; authorize: () => Promise<AdminGuardContext>; now: () => Date; stripe: () => Stripe; notify?: TrialPostCommitDelivery;
}): StripeTrialRecoveryService {
  const transaction: Transaction = dependencies?.transaction ?? ((run) => prismaAdmin.$transaction(run, { timeout: 20000 }))
  const authorize = dependencies?.authorize ?? (() => requireAdminElevation({ minRole: "platform_owner" }))
  const stripe = dependencies?.stripe ?? (() => createStripeClient({ maxNetworkRetries: 0 }))
  const now = (): Date => {
    const value = new Date(dependencies?.now() ?? new Date())
    if (!Number.isFinite(+value)) return fail("trial_operation_unavailable", 503)
    return value
  }
  async function locked<T>(userId: string, run: (tx: Prisma.TransactionClient, profile: UserProfile) => Promise<T>): Promise<T> {
    return transaction(async (tx) => {
      await lockTenantBilling(tx, userId)
      const profile = await tx.userProfile.findUnique({ where: { userId } })
      if (!profile) return fail("trial_operation_not_found", 404)
      return run(tx, profile)
    })
  }
  function ids(userId: string, operationId: string) {
    return { userId: z.string().trim().min(1).parse(userId), operationId: z.uuid().parse(operationId).toLowerCase() }
  }
  async function status(userId: string, operationId: string): Promise<StripeTrialRecoveryStatus> {
    const owner = await authorize(); assertTrialAccessOwner(owner, now())
    const id = ids(userId, operationId)
    return locked(id.userId, async (tx) => {
      assertTrialAccessOwner(owner, now())
      const op = scoped(await tx.tenantTrialOperation.findUnique({ where: { id: id.operationId } }), id.userId, owner)
      const notification = await tx.tenantTrialNotification.findUnique({ where: { operationId: op.id } })
      return { operationId: op.id, source: "stripe_trial" as const, status: op.status, result: terminal(op),
        reconciliationRequired: ["pending", "reconciliation_required"].includes(op.status),
        notificationStatus: notification?.status ?? "not_requested" }
    })
  }
  async function reconcile(userId: string, operationId: string, raw: unknown,
    request: TrialOperationRequestContext): Promise<StripeTrialExtensionOutcome> {
    const owner = await authorize(); assertTrialAccessOwner(owner, now())
    const id = ids(userId, operationId); z.object({}).strict().parse(raw)
    const accepted = await locked(id.userId, async (tx, profile) => {
      assertTrialAccessOwner(owner, now())
      const op = scoped(await tx.tenantTrialOperation.findUnique({ where: { id: id.operationId } }), id.userId, owner)
      const done = terminal(op); if (done) return { result: done }
      assertStripeTrialIntent(op)
      const fence = await claimStripeTrialRecovery(tx, profile, op, now())
      if (!fence) return { result: trialPending(op.id) }
      const grant = await tx.tenantTrialGrant.findUnique({ where: { userId: id.userId } })
      const billingRisks = await tx.tenantBillingRisk.findMany({ where: { userId: id.userId } })
      const snapshot = trialOperationAuditSnapshot(resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(profile.userId), profile, grant, billingRisks }, now()), profile)
      await writeTrialAuditEvent(tx, { ...auditContext(op, owner, request), occurredAt: now(), previous: snapshot, after: snapshot,
        subtype: "trial_recovery", originalSessionId: op.adminSessionId, recoveringSessionId: owner.adminSession.id,
        result: { status: "pending" } })
      // Recheck after mandatory audit. Its transaction must COMMIT before replay.
      assertTrialAccessOwner(owner, now())
      await assertStripeTrialFence(tx, profile, op, fence, now())
      return { op, fence }
    })
    if (accepted.result) return afterTrialAccessCommit(id.userId, accepted.result, request, dependencies?.notify)
    const { op, fence } = accepted as { op: TenantTrialOperation; fence: OwnerBillingFence }
    try {
      const decision = await locked(id.userId, async (tx, profile) => {
        assertTrialAccessOwner(owner, now())
        await assertStripeTrialFence(tx, profile, op, fence, now())
        const latest = scoped(await tx.tenantTrialOperation.findUnique({ where: { id: op.id } }), id.userId, owner)
        const proof = storedStripeTrialProof(latest)
        if (proof) return { result: await finalizeStripeTrialInTransaction({ tx, profile, op: latest, fence,
          stripe: stripe(), proof, audit: auditContext(op, owner, request), now, allowSupersession: true }) }
        // Matching current date is NOT attributable evidence. Replay only the same
        // keyed update, only while retained and still safe for this exact binding.
        const currentId = profile.stripeSubscriptionId
        if (!currentId) return {}
        const current = await retrieveSubscriptionWithLatestInvoice(stripe(), currentId)
        const verified = reconcileStripeSubscription(current, { subscriptionId: currentId, binding: profile })
        if (verified.kind !== "current") return {}
        // Retrieval still happens outside key retention. It can reconcile real
        // current lifecycle state, but CANNOT prove or release the original request.
        const projection = stripeSnapshotProfileData(verified.snapshot)
        const changed = Object.entries(projection).some(([key, value]) => {
          const previous = profile[key as keyof UserProfile]
          return value instanceof Date ? !(previous instanceof Date) || +previous !== +value : previous !== value
        })
        await assertStripeTrialFence(tx, profile, op, fence, now())
        if (changed) await tx.userProfile.update({ where: { userId: id.userId }, data: {
          ...projection, billingAccessVersion: { increment: 1 },
        } })
        if (now().getTime() >= op.firstAttemptAt!.getTime() + STRIPE_TRIAL_RETENTION_MS ||
            profile.stripeSubscriptionId !== op.stripeSubscriptionId || profile.stripeCustomerId !== op.stripeCustomerId ||
            verified.snapshot.tier !== op.targetPlan || !supportedStripeTrial(current) ||
            !current.trial_end || current.trial_end > op.targetExpiresAt!.getTime() / 1000) return {}
        await assertStripeTrialFence(tx, profile, op, fence, now())
        return { replay: true }
      })
      if (decision.result) return afterTrialAccessCommit(id.userId, decision.result, request, dependencies?.notify)
      if (!decision.replay) return await unknown()
      // Acceptance/read commit may cross the lease/session/retention boundary.
      assertTrialAccessOwner(owner, now())
      if (now().getTime() >= op.firstAttemptAt!.getTime() + STRIPE_TRIAL_RETENTION_MS) return await unknown()
      const lease = await locked(id.userId, async (tx, profile) => {
        await assertStripeTrialFence(tx, profile, op, fence, now())
        const current = await tx.tenantTrialOperation.findUnique({ where: { id: op.id } })
        return current?.leaseExpiresAt
      })
      assertTrialAccessOwner(owner, now())
      if (!lease || now() >= lease || now().getTime() >= op.firstAttemptAt!.getTime() + STRIPE_TRIAL_RETENTION_MS) return await unknown()
      const response = await stripe().subscriptions.update(op.stripeSubscriptionId!, {
        trial_end: op.targetExpiresAt!.getTime() / 1000, proration_behavior: "none",
      }, { idempotencyKey: op.stripeIdempotencyKey!, maxNetworkRetries: 0 })
      const proof = stripeTrialResponseProof(op, response, response.lastResponse?.requestId ?? null)
      if (!proof) return await unknown()
      const result = await locked(id.userId, async (tx, profile) => {
        await assertStripeTrialFence(tx, profile, op, fence, now())
        return finalizeStripeTrialInTransaction({ tx, profile, op, fence, stripe: stripe(), proof,
          audit: auditContext(op, owner, request), now, allowSupersession: true })
      })
          return afterTrialAccessCommit(id.userId, result, request, dependencies?.notify)
    } catch { return await unknown() }

    async function unknown(): Promise<StripeTrialExtensionOutcome> {
      try {
        return await locked(id.userId, async (tx, profile) => {
          await assertStripeTrialFence(tx, profile, op, fence, now())
          await tx.tenantTrialOperation.update({ where: { id: op.id }, data: { status: "reconciliation_required",
            failureCode: "provider_outcome_unknown" } })
          return trialPending(op.id)
        })
      } catch { return trialPending(op.id) }
    }
  }
  return { status, reconcile }
}