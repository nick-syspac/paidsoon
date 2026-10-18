import "server-only"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"
import { randomUUID } from "node:crypto"
import type Stripe from "stripe"
import { z } from "zod"
import { requireAdminElevation, type AdminGuardContext } from "@/lib/admin/guard"
import { writeTrialAuditEvent, type TrialAuditSnapshot } from "@/lib/admin/audit"
import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma, UserProfile } from "@/lib/generated/prisma/client"
import { lockTenantBilling } from "@/lib/billing/tenantBillingLock"
import { TenantBillingConflictError } from "@/lib/billing/tenantBillingFence"
import { resolveEffectiveAccess, type EffectiveAccess } from "@/lib/billing/effectiveAccess"
import {
  createTrialAccessPreviewService, assertTrialAccessOwner, safeTrialAccessSnapshot,
  TrialPreviewError, type SafeTrialPreviewSnapshot,
} from "@/lib/billing/trialAccessPreview"
import { trialAccessConfirmationSchema, validateFrozenTrialExpiry } from "@/lib/billing/trialAccessInput"
import { afterTrialAccessCommit, type TrialPostCommitDelivery } from "@/lib/email/trialAccessPostCommit"
import type { TrialNotificationDeliveryOutcome } from "@/lib/email/trialAccessDelivery"

type Transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>
export interface TrialOperationRequestContext {
  ipAddress: string
  userAgent: string
  requestId: string
}
export interface LocalTrialOperationResult {
  operationId: string
  action: "extend_or_grant" | "revoke_grant"
  source: "admin_grant"
  status: "succeeded"
  targetPlan: string | null
  targetExpiresAt: string | null
  version: number
  notificationStatus: "pending" | "not_requested"
  after: SafeTrialPreviewSnapshot
  notification?: TrialNotificationDeliveryOutcome
}

const fail = (code: string, status: TrialPreviewError["status"] = 409): never => {
  throw new TrialPreviewError(code, status)
}
/** Internal allowlisted audit projection shared by local and Stripe owner services. */
export function trialOperationAuditSnapshot(access: EffectiveAccess, profile: UserProfile): TrialAuditSnapshot {
  return {
    source: access.source, effectivePlan: access.effectiveTier,
    effectiveAccessExpiresAt: access.effectiveAccessExpiresAt,
    effectiveTrialExpiresAt: access.effectiveTrialExpiresAt,
    effectiveExpirySource: access.effectiveExpirySource, stripeTrialEndsAt: access.stripeTrialEndsAt,
    grantPlan: access.grant?.plan ?? null, grantExpiresAt: access.grant?.expiresAt ?? null,
    // Unknown billing state must not prevent removing an existing grant. Audit
    // schemas accept canonical values only, never arbitrary persisted strings.
    billingPlan: canonicalBillingPlan(profile.subscriptionTier),
    billingStatus: ["active", "trialing", "past_due", "unpaid", "incomplete", "incomplete_expired", "paused", "canceled"].includes(profile.subscriptionStatus)
      ? profile.subscriptionStatus as TrialAuditSnapshot["billingStatus"] : profile.subscriptionStatus === "cancelled" ? "canceled" : null,
    stripeSubscriptionId: profile.stripeSubscriptionId, stripeCustomerId: profile.stripeCustomerId,
    billingAccessVersion: profile.billingAccessVersion,
  }
}
function canonicalBillingPlan(value: string): TrialAuditSnapshot["billingPlan"] {
  if (value === "starter") return "essentials"
  if (value === "solo") return "business_control"
  return ["essentials", "business_control", "small_business", "business_pro", "accountant_partner"].includes(value)
    ? value as TrialAuditSnapshot["billingPlan"] : null
}

const auditSnapshot = trialOperationAuditSnapshot

/**
 * Narrow privileged owner exception: server owner guard precedes all lookups;
 * grants/journal/audit/outbox and only the profile version share one tenant lock
 * and transaction. No billing projection, invoice usage reset or provider send.
 */
export function createTrialAccessOperationService(dependencies?: {
  transaction: Transaction
  authorize: () => Promise<AdminGuardContext>
  now: () => Date
  stripe: () => Stripe
  notify?: TrialPostCommitDelivery
}): {
  confirm(userId: string, raw: unknown, request: TrialOperationRequestContext): Promise<LocalTrialOperationResult>
} {
  const transaction: Transaction = dependencies?.transaction ?? ((run) => prismaAdmin.$transaction(run, { timeout: 20000 }))
  const authorize = dependencies?.authorize ?? (() => requireAdminElevation({ minRole: "platform_owner" }))
  const clock = dependencies?.now ?? (() => new Date())
  const previews = createTrialAccessPreviewService(dependencies)
  function now(): Date {
    const value = new Date(clock())
    if (!Number.isFinite(value.getTime())) return fail("trial_operation_unavailable", 503)
    return value
  }
  async function confirm(userId: string, raw: unknown, request: TrialOperationRequestContext): Promise<LocalTrialOperationResult> {
    const owner = await authorize()
    assertTrialAccessOwner(owner, now())
    userId = z.string().trim().min(1).parse(userId)
    const input = trialAccessConfirmationSchema.parse(raw)
    try {
      const result = await transaction(async (tx) => {
        await lockTenantBilling(tx, userId)
        assertTrialAccessOwner(owner, now())
        const profile = await tx.userProfile.findUnique({ where: { userId } })
        if (!profile) return fail("trial_tenant_not_found", 404)
        const existing = await tx.tenantTrialOperation.findUnique({ where: { id: input.operationId.toLowerCase() } })
        if (!existing || existing.userId !== userId || existing.actorUserId !== owner.userId || existing.adminSessionId !== owner.adminSession.id) {
          return fail("trial_operation_not_found", 404)
        }
        // Resolve completed identity before today's TTL/version/reservations.
        // The result is an immutable safe projection produced only below.
        if (existing.status === "succeeded") {
          if (input.expectedVersion !== existing.previewVersion) return fail("trial_preview_stale")
          if (existing.source !== "admin_grant") return fail("trial_stripe_saga_required")
          if (!existing.result) return fail("trial_operation_unavailable", 503)
          return structuredClone(existing.result) as unknown as LocalTrialOperationResult
        }
        const validated = await previews.validateConfirmationInTransaction(tx, profile, owner, input)
        const op = validated.operation
        if (op.source !== "admin_grant") return fail("trial_stripe_saga_required")
        const current = await tx.tenantTrialGrant.findUnique({ where: { userId } })
        let instant = now()
        assertTrialAccessOwner(owner, instant)
        if (instant >= op.previewExpiresAt) return fail("trial_preview_expired")
        if (op.action === "extend_or_grant") {
          try {
            validateFrozenTrialExpiry(op.targetExpiresAt!, { now: instant,
              currentEffectiveTrialExpiry: validated.effectiveAccess.effectiveTrialExpiresAt, source: "admin_grant" })
          } catch { return fail("trial_preview_stale") }
        }
        const previous = auditSnapshot(validated.effectiveAccess, validated.effectiveProfile)
        const intendedProfile = { ...validated.effectiveProfile, billingAccessVersion: op.previewVersion + 1 }
        const intendedGrant = op.action === "revoke_grant"
          ? { ...current!, revokedAt: instant }
          : { plan: op.targetPlan!, startsAt: current && current.revokedAt === null && current.startsAt <= instant && instant < current.expiresAt
              ? current.startsAt : instant, expiresAt: op.targetExpiresAt!, revokedAt: null }
        const intended = resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(userId), profile: intendedProfile,
          grant: intendedGrant, billingRisks: validated.billingRisks }, instant)
        const audit = {
          operationId: op.id, operationAction: op.action, source: op.source, occurredAt: instant,
          tenantId: userId, reason: op.reason,
          actor: { actorUserId: owner.userId, actorEmail: owner.userEmail, platformRole: "platform_owner" as const,
            adminSessionId: owner.adminSession.id, adminDeviceId: owner.adminSession.adminDeviceId,
            ipAddress: request.ipAddress, userAgent: request.userAgent, requestId: request.requestId },
          previous,
        }
        // MUST precede every grant, version, journal or delivery mutation.
        await writeTrialAuditEvent(tx, { ...audit, subtype: "trial_attempt",
          after: auditSnapshot(intended, intendedProfile), result: { status: "pending" } })
        // Even persistence can outlive a preview/session or a short explicit
        // target. Recheck immediately before mutation; failure rolls back audit.
        instant = now()
        assertTrialAccessOwner(owner, instant)
        if (instant >= op.previewExpiresAt) return fail("trial_preview_expired")
        if (op.action === "extend_or_grant") {
          try {
            validateFrozenTrialExpiry(op.targetExpiresAt!, { now: instant,
              currentEffectiveTrialExpiry: validated.effectiveAccess.effectiveTrialExpiresAt, source: "admin_grant" })
          } catch { return fail("trial_preview_stale") }
        }
        const second = new Date(Math.floor(instant.getTime() / 1000) * 1000)
        const continuing = current && current.revokedAt === null && current.startsAt <= instant && instant < current.expiresAt
        const grant = op.action === "revoke_grant"
          ? await tx.tenantTrialGrant.update({ where: { userId }, data: { revokedAt: second, lastOperationId: op.id } })
          : current
            ? await tx.tenantTrialGrant.update({ where: { userId }, data: {
              plan: op.targetPlan!, expiresAt: op.targetExpiresAt!, lastOperationId: op.id,
              ...(continuing ? {} : { id: randomUUID(), startsAt: second, revokedAt: null, creatorOperationId: op.id }),
            } })
            : await tx.tenantTrialGrant.create({ data: { userId, plan: op.targetPlan!, startsAt: second,
              expiresAt: op.targetExpiresAt!, creatorOperationId: op.id, lastOperationId: op.id } })
        const changed = await tx.userProfile.updateMany({
          where: { userId, billingAccessVersion: op.previewVersion, pendingTrialOperationId: null, pendingBillingMutationId: null },
          data: { billingAccessVersion: { increment: 1 } },
        })
        if (changed.count !== 1) return fail("trial_preview_stale")
        const afterProfile = { ...validated.effectiveProfile, billingAccessVersion: op.previewVersion + 1 }
        const afterAccess = resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(userId), profile: afterProfile, grant, billingRisks: validated.billingRisks }, instant)
        const result: LocalTrialOperationResult = {
          operationId: op.id, action: op.action, source: "admin_grant", status: "succeeded",
          targetPlan: op.targetPlan, targetExpiresAt: op.targetExpiresAt?.toISOString() ?? null,
          version: afterProfile.billingAccessVersion, notificationStatus: op.notify ? "pending" : "not_requested",
          after: safeTrialAccessSnapshot(afterAccess, afterProfile),
        }
        // Any older never-sent message describes an obsolete result, including
        // revocation/expired/replaced windows. Unknown/in-flight deliveries need
        // provider reconciliation (task 7), not an invented successful outcome.
        await tx.tenantTrialNotification.updateMany({ where: { userId, sentAt: null,
          status: { in: ["pending", "failed", "blocked"] },
          operation: { status: "succeeded" },
        }, data: { status: "superseded" } })
        if (op.notify) await tx.tenantTrialNotification.create({ data: {
          userId, operationId: op.id, status: "pending", providerIdempotencyKey: `trial-access/${op.id}`,
        } })
        const completed = await tx.tenantTrialOperation.updateMany({
          where: { id: op.id, userId, actorUserId: owner.userId, adminSessionId: owner.adminSession.id, status: "previewed" },
          data: { status: "succeeded", result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonObject,
            attempts: { increment: 1 }, firstAttemptAt: instant, lastAttemptAt: instant, completedAt: instant },
        })
        if (completed.count !== 1) return fail("trial_preview_stale")
        await writeTrialAuditEvent(tx, { ...audit, occurredAt: instant, subtype: "trial_result",
          after: auditSnapshot(afterAccess, afterProfile), result: { status: "succeeded" } })
        return result
      })
      return afterTrialAccessCommit(userId, result, request, dependencies?.notify)
    } catch (error) {
      if (error instanceof TrialPreviewError || error instanceof TenantBillingConflictError || error instanceof z.ZodError) throw error
      return fail("trial_operation_unavailable", 503)
    }
  }
  return { confirm }
}