import "server-only"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"
import { randomUUID } from "node:crypto"
import type Stripe from "stripe"
import { z } from "zod"
import { requireAdminElevation, type AdminGuardContext } from "@/lib/admin/guard"
import { writeTrialAuditEvent } from "@/lib/admin/audit"
import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma, TenantTrialOperation, UserProfile } from "@/lib/generated/prisma/client"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { lockTenantBilling } from "@/lib/billing/tenantBillingLock"
import { assertBillingFence, TenantBillingConflictError, type OwnerBillingFence } from "@/lib/billing/tenantBillingFence"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { reconcileStripeSubscription, retrieveSubscriptionWithLatestInvoice, stripeTimestamp } from "@/lib/billing/stripeSubscriptions"
import { finalizeStripeTrialInTransaction, stripeTrialResponseProof, supportedStripeTrial } from "@/lib/billing/stripeTrialFinalization"
import { trialAccessConfirmationSchema, validateFrozenTrialExpiry } from "@/lib/billing/trialAccessInput"
import { assertTrialAccessOwner, createTrialAccessPreviewService, TrialPreviewError, type SafeTrialPreviewSnapshot } from "@/lib/billing/trialAccessPreview"
import { trialOperationAuditSnapshot, type TrialOperationRequestContext } from "@/lib/billing/trialAccessOperations"
import { afterTrialAccessCommit, type TrialPostCommitDelivery } from "@/lib/email/trialAccessPostCommit"
import type { TrialNotificationDeliveryOutcome } from "@/lib/email/trialAccessDelivery"

type Transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
export interface StripeTrialExtensionResult {
  operationId: string
  action: "extend_or_grant"
  source: "stripe_trial"
  status: "succeeded"
  targetPlan: string
  targetExpiresAt: string
  version: number
  notificationStatus: "pending" | "not_requested"
  after: SafeTrialPreviewSnapshot
  notification?: TrialNotificationDeliveryOutcome
}
export type StripeTrialExtensionOutcome = StripeTrialExtensionResult | {
  operationId: string; source: "stripe_trial"; status: "superseded"; version: number
  notificationStatus: "not_requested"; after: SafeTrialPreviewSnapshot
} | {
  operationId: string; source: "stripe_trial"; status: "pending" | "reconciliation_required"
  reconciliationRequired: true
} | {
  operationId: string; source: "stripe_trial"; status: "failed"; failureCode: "provider_rejected"
}
const fail = (code: string, status: TrialPreviewError["status"] = 409): never => { throw new TrialPreviewError(code, status) }
const json = (value: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject
const pending = (operationId: string): StripeTrialExtensionOutcome => ({
  operationId, source: "stripe_trial", status: "reconciliation_required", reconciliationRequired: true,
})

/** Pinned update API: anchor + two years, conservatively capped at 730 elapsed
 * days (including leap years). Also retain the legacy total-trial 730-day guard.
 * Unknown flags are unsafe, not false. Never resume/cancel/change items here.
 */
export function validateStripeTrialExtension(subscription: Stripe.Subscription, target: Date, now: Date): void {
  if (!supportedStripeTrial(subscription)) return fail("trial_stripe_configuration_unsupported")
  const anchor = stripeTimestamp(subscription.billing_cycle_anchor)
  const start = stripeTimestamp(subscription.trial_start)
  const current = stripeTimestamp(subscription.trial_end)
  if (!anchor || !start || !current || !Number.isFinite(now.getTime()) || target.getTime() % 1000 !== 0) return fail("trial_stripe_timing_unavailable", 503)
  const twoYears = new Date(anchor); twoYears.setUTCFullYear(twoYears.getUTCFullYear() + 2)
  const days730 = 730 * 86400000
  if (target.getTime() > Math.min(twoYears.getTime(), anchor.getTime() + days730, start.getTime() + days730)) {
    return fail("trial_stripe_horizon_exceeded")
  }
  try { validateFrozenTrialExpiry(target, { now, currentEffectiveTrialExpiry: current, source: "stripe_trial" }) }
  catch { return fail("trial_preview_stale") }
}

/** Only a typed, explicit validation rejection proves this single update did not
 * execute. HTTP status alone, idempotency conflicts, 500s and transport errors do not.
 */
export function isDefinitiveTrialRejection(error: unknown): boolean {
  const parsed = z.object({ type: z.literal("StripeInvalidRequestError"), statusCode: z.literal(400),
    code: z.string().optional(), raw: z.object({ type: z.literal("invalid_request_error") }).passthrough(),
  }).safeParse(error)
  return parsed.success && !["idempotency_key_in_use", "idempotency_error"].includes(parsed.data.code ?? "")
}

function audit(owner: AdminGuardContext, op: TenantTrialOperation, request: TrialOperationRequestContext, now: Date,
  previous: ReturnType<typeof trialOperationAuditSnapshot>, after = previous) {
  return { operationId: op.id, operationAction: op.action, source: op.source, occurredAt: now,
    tenantId: op.userId, reason: op.reason, previous, after,
    actor: { actorUserId: owner.userId, actorEmail: owner.userEmail, platformRole: "platform_owner" as const,
      adminSessionId: owner.adminSession.id, adminDeviceId: owner.adminSession.adminDeviceId,
      ipAddress: request.ipAddress, userAgent: request.userAgent, requestId: request.requestId } }
}
function identity(op: TenantTrialOperation | null, owner: AdminGuardContext, userId: string, version: number): TenantTrialOperation {
  if (!op || op.userId !== userId || op.actorUserId !== owner.userId || op.adminSessionId !== owner.adminSession.id) return fail("trial_operation_not_found", 404)
  if (op.previewVersion !== version) return fail("trial_preview_stale")
  if (op.source !== "stripe_trial" || op.action !== "extend_or_grant") return fail("trial_stripe_intent_required")
  return op
}

/** Reusable INTERNAL recovery seam: caller holds billing-access:<tenant>. This
 * grants no dispatch/release permission without the current durable owner fence.
 * Never accept a customer fence or a caller-supplied replacement target/key.
 */
export async function readFencedStripeTrialOperation(
  tx: Prisma.TransactionClient, profile: UserProfile, fence: OwnerBillingFence, now: Date,
): Promise<TenantTrialOperation> {
  if (fence.kind !== "owner") return fail("trial_operation_fence_lost")
  await assertBillingFence(tx, profile, fence, now)
  const op = await tx.tenantTrialOperation.findUnique({ where: { id: fence.operationId } })
  if (!op || op.userId !== profile.userId || op.source !== "stripe_trial" || op.action !== "extend_or_grant" ||
      !op.targetExpiresAt || !op.firstAttemptAt || op.attempts < 1 ||
      op.stripeIdempotencyKey !== `trial-extension/${op.id}`) return fail("trial_operation_evidence_missing")
  return op
}

/** Narrow server-only owner exception: authorize every request before any lookup.
 * Tenant lock -> owner fence; acceptance COMMIT precedes the ONLY provider write.
 * Confirmation never reposts an unresolved request; explicit owner recovery uses
 * the separate retained-key/evidence service and this same finalization seam.
 */
export function createStripeTrialExtensionService(dependencies?: {
  transaction: Transaction; authorize: () => Promise<AdminGuardContext>; now: () => Date; stripe: () => Stripe; notify?: TrialPostCommitDelivery;
}): { confirm(userId: string, raw: unknown, request: TrialOperationRequestContext): Promise<StripeTrialExtensionOutcome> } {
  const transaction: Transaction = dependencies?.transaction ?? ((run) => prismaAdmin.$transaction(run, { timeout: 20000 }))
  const authorize = dependencies?.authorize ?? (() => requireAdminElevation({ minRole: "platform_owner" }))
  const clock = dependencies?.now ?? (() => new Date())
  const stripe = dependencies?.stripe ?? (() => createStripeClient({ maxNetworkRetries: 0 }))
  const previews = createTrialAccessPreviewService(dependencies)
  const now = (): Date => {
    const value = new Date(clock())
    if (!Number.isFinite(value.getTime())) return fail("trial_operation_unavailable", 503)
    return value
  }
  async function locked<T>(userId: string, run: (tx: Prisma.TransactionClient, profile: UserProfile) => Promise<T>): Promise<T> {
    return transaction(async (tx) => {
      await lockTenantBilling(tx, userId)
      const profile = await tx.userProfile.findUnique({ where: { userId } })
      if (!profile) return fail("trial_tenant_not_found", 404)
      return run(tx, profile)
    })
  }
  async function confirm(userId: string, raw: unknown, request: TrialOperationRequestContext): Promise<StripeTrialExtensionOutcome> {
    const owner = await authorize()
    assertTrialAccessOwner(owner, now())
    userId = z.string().trim().min(1).parse(userId)
    const input = trialAccessConfirmationSchema.parse(raw)
    let accepted: { operation: TenantTrialOperation; fence: OwnerBillingFence; leaseExpiresAt: Date } | StripeTrialExtensionOutcome
    try {
      accepted = await locked(userId, async (tx, profile) => {
        assertTrialAccessOwner(owner, now())
        const op = identity(await tx.tenantTrialOperation.findUnique({ where: { id: input.operationId.toLowerCase() } }), owner, userId, input.expectedVersion)
        if (op.status === "succeeded" || op.status === "failed") {
          if (!op.result) return fail("trial_operation_unavailable", 503)
          return structuredClone(op.result) as unknown as StripeTrialExtensionOutcome
        }
        if (op.status === "pending" || op.status === "reconciliation_required") return pending(op.id)
        const validated = await previews.validateConfirmationInTransaction(tx, profile, owner, input)
        if (!op.stripeCustomerId || !op.stripeSubscriptionId || !op.targetExpiresAt || !op.targetPlan ||
            op.stripeCustomerId !== profile.stripeCustomerId || op.stripeSubscriptionId !== profile.stripeSubscriptionId ||
            profile.stripeScheduleId !== null || profile.pendingDowngradeTier !== null ||
            profile.subscriptionCancelAt !== null || profile.subscriptionCancelAtPeriodEnd !== false) return fail("trial_stripe_configuration_unsupported")
        const current = await retrieveSubscriptionWithLatestInvoice(stripe(), op.stripeSubscriptionId)
        const mapped = reconcileStripeSubscription(current, { subscriptionId: op.stripeSubscriptionId, binding: profile })
        if (mapped.kind !== "current" || mapped.snapshot.tier !== op.targetPlan ||
            mapped.snapshot.trialEndsAt?.getTime() !== validated.effectiveProfile.trialEndsAt?.getTime() ||
            mapped.snapshot.priceId !== validated.effectiveProfile.stripePriceId) return fail("trial_preview_stale")
        validateStripeTrialExtension(current, op.targetExpiresAt, now())
        const previous = trialOperationAuditSnapshot(validated.effectiveAccess, validated.effectiveProfile)
        const intendedProfile = { ...validated.effectiveProfile, trialEndsAt: op.targetExpiresAt, billingAccessVersion: profile.billingAccessVersion + 1 }
        const existingGrant = await tx.tenantTrialGrant.findUnique({ where: { userId } })
        const intended = resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(profile.userId), profile: intendedProfile, grant: existingGrant, billingRisks: validated.billingRisks }, now())
        await writeTrialAuditEvent(tx, { ...audit(owner, op, request, now(), previous, trialOperationAuditSnapshot(intended, intendedProfile)),
          subtype: "trial_attempt", result: { status: "pending" } })
        const instant = now()
        assertTrialAccessOwner(owner, instant)
        if (instant >= op.previewExpiresAt) return fail("trial_preview_expired")
        validateStripeTrialExtension(current, op.targetExpiresAt, instant)
        try { validateFrozenTrialExpiry(op.targetExpiresAt, { now: instant,
          currentEffectiveTrialExpiry: validated.effectiveAccess.effectiveTrialExpiresAt, source: "stripe_trial" }) }
        catch { return fail("trial_preview_stale") }
        const leaseOwner = randomUUID(), fencingToken = op.fencingToken + 1
        const leaseExpiresAt = new Date(instant.getTime() + 60000)
        const changed = await tx.userProfile.updateMany({ where: { userId, billingAccessVersion: op.previewVersion,
          pendingTrialOperationId: null, pendingBillingMutationId: null },
          data: { pendingTrialOperationId: op.id, billingAccessVersion: { increment: 1 } } })
        if (changed.count !== 1) return fail("trial_preview_stale")
        const claimed = await tx.tenantTrialOperation.updateMany({ where: { id: op.id, userId, status: "previewed", fencingToken: op.fencingToken },
          data: { status: "pending", stripeIdempotencyKey: `trial-extension/${op.id}`, leaseOwner, leaseExpiresAt,
            fencingToken, attempts: { increment: 1 }, firstAttemptAt: instant, lastAttemptAt: instant } })
        if (claimed.count !== 1) return fail("trial_preview_stale")
        return { operation: { ...op, stripeIdempotencyKey: `trial-extension/${op.id}`, firstAttemptAt: instant },
          fence: { kind: "owner" as const, operationId: op.id, leaseOwner, fencingToken }, leaseExpiresAt }
      })
    } catch (error) {
      if (error instanceof TrialPreviewError || error instanceof TenantBillingConflictError || error instanceof z.ZodError) throw error
      return fail("trial_operation_unavailable", 503)
    }
    if (!("operation" in accepted)) return afterTrialAccessCommit(userId, accepted, request, dependencies?.notify)
    const { operation: op, fence, leaseExpiresAt } = accepted
    // Commit may itself take time. Do not dispatch after the accepted lease or
    // owner session expires; the durable reservation remains conservatively held.
    try { assertTrialAccessOwner(owner, now()) } catch { return pending(op.id) }
    if (leaseExpiresAt <= now() || op.targetExpiresAt! <= now()) return pending(op.id)
    let response: Stripe.Response<Stripe.Subscription>
    try {
      response = await stripe().subscriptions.update(op.stripeSubscriptionId!, {
        trial_end: op.targetExpiresAt!.getTime() / 1000, proration_behavior: "none",
      }, { idempotencyKey: op.stripeIdempotencyKey!, maxNetworkRetries: 0 })
    } catch (error) {
      return finishRejectedOrUnknown(isDefinitiveTrialRejection(error))
    }
    try {
      const proof = stripeTrialResponseProof({ ...op, attempts: 1 }, response, response.lastResponse?.requestId ?? null)
      if (!proof) return finishRejectedOrUnknown(false)
      const result = await locked(userId, async (tx, profile) => {
        const currentOp = identity(await readFencedStripeTrialOperation(tx, profile, fence, now()), owner, userId, input.expectedVersion)
        const previous = trialOperationAuditSnapshot(resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(profile.userId), profile, grant: null, billingRisks: [] }, now()), profile)
        return finalizeStripeTrialInTransaction({ tx, profile, op: currentOp, fence, stripe: stripe(), proof,
          audit: audit(owner, currentOp, request, now(), previous), now })
      })
          return afterTrialAccessCommit(userId, result, request, dependencies?.notify)
    } catch { return finishRejectedOrUnknown(false, "finalization") }

    async function finishRejectedOrUnknown(definitive: boolean, stage: "provider" | "finalization" = "provider"): Promise<StripeTrialExtensionOutcome> {
      try {
        return await locked(userId, async (tx, profile) => {
          const currentOp = identity(await readFencedStripeTrialOperation(tx, profile, fence, now()), owner, userId, input.expectedVersion)
          const grant = await tx.tenantTrialGrant.findUnique({ where: { userId } })
          const billingRisks = await tx.tenantBillingRisk.findMany({ where: { userId } })
          const access = resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(profile.userId), profile, grant, billingRisks }, now())
          const result: StripeTrialExtensionOutcome = definitive ? { operationId: op.id, source: "stripe_trial", status: "failed", failureCode: "provider_rejected" } : pending(op.id)
          await writeTrialAuditEvent(tx, { ...audit(owner, currentOp, request, now(), trialOperationAuditSnapshot(access, profile)),
            subtype: "trial_result", result: { status: definitive ? "failed" : "reconciliation_required",
              failure: { code: definitive ? "provider_rejected" : "provider_outcome_unknown", stage, retryable: !definitive } } })
          await assertBillingFence(tx, profile, fence, now())
          await tx.tenantTrialOperation.update({ where: { id: op.id }, data: {
            status: definitive ? "failed" : "reconciliation_required", failureCode: definitive ? "provider_rejected" : "provider_outcome_unknown",
            ...(definitive ? { result: json(result), completedAt: now(), leaseOwner: null, leaseExpiresAt: null } : {}),
          } })
          if (definitive) await tx.userProfile.update({ where: { userId }, data: { pendingTrialOperationId: null, billingAccessVersion: { increment: 1 } } })
          return result
        })
      } catch { return pending(op.id) } // Mandatory audit failure rolls back; original attempt/reservation survives.
    }
  }
  return { confirm }
}