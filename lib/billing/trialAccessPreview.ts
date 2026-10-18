import "server-only"
import { createHash } from "node:crypto"
import type Stripe from "stripe"
import { z } from "zod"
import { requireAdminElevation, type AdminGuardContext } from "@/lib/admin/guard"
import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma, TenantTrialOperation, UserProfile } from "@/lib/generated/prisma/client"
import { lockTenantBilling } from "@/lib/billing/tenantBillingLock"
import { assertBillingReservation } from "@/lib/billing/tenantBillingFence"
import { resolveEffectiveAccess, type EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { readEffectiveAccessSnapshot } from "@/lib/billing/effectiveAccessSnapshot"
import { resolveTrialEligibility, type TrialBillingRiskEvidence, type TrialEligibility } from "@/lib/billing/trialEligibility"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { stripeSnapshotProfileData } from "@/lib/billing/stripeSubscriptions"
import {
  trialAccessPreviewSchema, trialAccessConfirmationSchema, validateTrialAccessSource,
  trialAccessPlanSchema,
  freezeTrialExpiry, validateFrozenTrialExpiry, formatTrialExpiryPreview,
  type TrialAccessPreviewInput, type TrialAccessMutationSource, type TrialExpiryPreview,
} from "@/lib/billing/trialAccessInput"

export const TRIAL_PREVIEW_TTL_MS = 15 * 60 * 1000
const tenantIdSchema = z.string().trim().min(1)
type Transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>

export class TrialPreviewError extends Error {
  constructor(readonly code: string, readonly status: 400 | 403 | 404 | 409 | 503) {
    super(code)
    this.name = "TrialPreviewError"
  }
}
const fail = (code: string, status: TrialPreviewError["status"] = 409): never => {
  throw new TrialPreviewError(code, status)
}

/** No identities, provider IDs, risk object IDs, reason, hashes or leases. */
export interface SafeTrialPreviewSnapshot {
  allowAccess: boolean
  effectivePlan: string | null
  source: EffectiveAccess["source"]
  effectiveAccessExpiresAt: string | null
  effectiveTrialExpiresAt: string | null
  effectiveExpirySource: EffectiveAccess["effectiveExpirySource"]
  effectiveExpiryPlan: string | null
  stripeTrialEndsAt: string | null
  billingPlan: string | null
  billingStatus: string | null
  grant: { plan: string | null; startsAt: string | null; expiresAt: string | null; revokedAt: string | null } | null
  restriction: EffectiveAccess["restriction"]
  trialTimingPendingReconciliation: boolean
}
export interface TrialPreviewResult {
  operationId: string
  action: TenantTrialOperation["action"]
  source: TrialAccessMutationSource
  status: TenantTrialOperation["status"]
  previewVersion: number
  previewExpiresAt: string
  targetPlan: TenantTrialOperation["targetPlan"]
  target: TrialExpiryPreview | null
  billingEffect: "stripe_first_billing_timing" | "application_access_only" | "grant_removal_only"
  previous: SafeTrialPreviewSnapshot
}

function json(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`
  }
  return JSON.stringify(value)
}
function hash(value: unknown): string {
  return createHash("sha256").update(canonical(json(value))).digest("hex")
}
function normalized(raw: unknown): TrialAccessPreviewInput {
  const input = trialAccessPreviewSchema.parse(raw)
  return { ...input, operationId: input.operationId.toLowerCase() }
}
const iso = (value: Date | null): string | null => value?.toISOString() ?? null
export function safeTrialAccessSnapshot(access: EffectiveAccess, profile: UserProfile): SafeTrialPreviewSnapshot {
  return {
    allowAccess: access.allowAccess, effectivePlan: access.effectiveTier, source: access.source,
    effectiveAccessExpiresAt: iso(access.effectiveAccessExpiresAt),
    effectiveTrialExpiresAt: iso(access.effectiveTrialExpiresAt),
    effectiveExpirySource: access.effectiveExpirySource, effectiveExpiryPlan: access.effectiveExpiryTier,
    stripeTrialEndsAt: iso(access.stripeTrialEndsAt), billingPlan: profile.subscriptionTier,
    billingStatus: profile.subscriptionStatus, restriction: access.restriction,
    trialTimingPendingReconciliation: access.trialTimingPendingReconciliation,
    grant: access.grant ? { plan: access.grant.plan, startsAt: iso(access.grant.startsAt),
      expiresAt: iso(access.grant.expiresAt), revokedAt: iso(access.grant.revokedAt) } : null,
  }
}
function project(op: TenantTrialOperation, now: Date): TrialPreviewResult {
  return {
    operationId: op.id, action: op.action, source: op.source,
    // Expiry is a read-time status, not permission to rewrite a completed journal.
    status: op.status === "previewed" && now >= op.previewExpiresAt ? "expired_preview" : op.status,
    previewVersion: op.previewVersion, previewExpiresAt: op.previewExpiresAt.toISOString(),
    targetPlan: op.targetPlan,
    target: op.targetExpiresAt ? formatTrialExpiryPreview(op.targetExpiresAt, op.timeZone) : null,
    billingEffect: op.action === "revoke_grant" ? "grant_removal_only"
      : op.source === "stripe_trial" ? "stripe_first_billing_timing" : "application_access_only",
    previous: op.previousSnapshot as unknown as SafeTrialPreviewSnapshot,
  }
}

/** Internal evidence for later atomic acceptance; NEVER a route response. */
export interface ValidatedTrialPreview {
  operation: TenantTrialOperation
  preview: TrialPreviewResult
  effectiveAccess: EffectiveAccess
  effectiveProfile: UserProfile
  billingRisks: Parameters<typeof resolveEffectiveAccess>[0]["billingRisks"]
}
export interface TrialAccessPreviewService {
  preview(userId: string, raw: unknown): Promise<TrialPreviewResult>
  validateConfirmation(userId: string, raw: unknown): Promise<ValidatedTrialPreview>
  validateConfirmationInTransaction(
    tx: Prisma.TransactionClient, profile: UserProfile, owner: AdminGuardContext, raw: unknown,
  ): Promise<ValidatedTrialPreview>
}

/** Defense in depth for services using an injected/server-authenticated context. */
export function assertTrialAccessOwner(owner: AdminGuardContext, now: Date): void {
  if (!owner.userId || owner.platformRole.userId !== owner.userId || owner.platformRole.role !== "platform_owner" ||
      owner.platformRole.status !== "active" || !owner.adminSession.id || owner.adminSession.userId !== owner.userId ||
      owner.adminSession.revokedAt || !Number.isFinite(owner.adminSession.expiresAt.getTime()) ||
      owner.adminSession.expiresAt <= now) return fail("trial_owner_required", 403)
}

/**
 * Narrow privileged owner-journal exception: authorization precedes every lookup,
 * and all tenant reads/persistence share billing-access:<tenant>. Provider calls
 * here are read-only; no access projection, reservation, audit or outbox writes.
 */
export function createTrialAccessPreviewService(dependencies?: {
  transaction: Transaction
  authorize: () => Promise<AdminGuardContext>
  now: () => Date
  stripe: () => Stripe
}): TrialAccessPreviewService {
  const transaction: Transaction = dependencies?.transaction ?? ((run) => prismaAdmin.$transaction(run, { timeout: 20000 }))
  const authorize = dependencies?.authorize ?? (() => requireAdminElevation({ minRole: "platform_owner" }))
  const clock = dependencies?.now ?? (() => new Date())
  const stripe = dependencies?.stripe ?? (() => createStripeClient({ maxNetworkRetries: 0 }))
  function now(): Date {
    const value = clock()
    if (!Number.isFinite(value.getTime())) return fail("trial_preview_unavailable", 503)
    return new Date(value)
  }
  function assertOwner(owner: AdminGuardContext): void {
    assertTrialAccessOwner(owner, now())
  }
  async function locked<T>(userId: string, run: (tx: Prisma.TransactionClient, profile: UserProfile) => Promise<T>): Promise<T> {
    try {
      return await transaction(async (tx) => {
        await lockTenantBilling(tx, userId)
        const profile = await tx.userProfile.findUnique({ where: { userId } })
        if (!profile) return fail("trial_tenant_not_found", 404)
        return run(tx, profile)
      })
    } catch (error) {
      if (error instanceof TrialPreviewError || error instanceof z.ZodError ||
          (error instanceof Error && error.name === "TenantBillingConflictError")) throw error
      // Concurrent globally identical keys in different tenant locks disclose nothing.
      if (typeof error === "object" && error && "code" in error && error.code === "P2002") return fail("trial_operation_key_conflict")
      return fail("trial_preview_unavailable", 503)
    }
  }
  function identity(op: TenantTrialOperation, owner: AdminGuardContext, userId: string, inputHash?: string): void {
    if (op.userId !== userId || op.actorUserId !== owner.userId || op.adminSessionId !== owner.adminSession.id ||
        (inputHash !== undefined && op.inputHash !== inputHash)) return fail("trial_operation_key_conflict")
  }
  async function observe(tx: Prisma.TransactionClient, profile: UserProfile, action: TrialAccessPreviewInput["action"]) {
    assertBillingReservation(profile)
    const snapshot = await readEffectiveAccessSnapshot(tx, profile.userId)
    if (!snapshot.profile) return fail("trial_tenant_not_found", 404)
    const grant = await tx.tenantTrialGrant.findUnique({ where: { userId: profile.userId } })
    const risks = await tx.tenantBillingRisk.findMany({ where: { userId: profile.userId } })
    const previousRisks: TrialBillingRiskEvidence[] = risks.map((risk) => ({
      kind: risk.kind, stripeObjectId: risk.stripeObjectId, stripeCustomerId: risk.stripeCustomerId,
      stripeSubscriptionId: risk.stripeSubscriptionId, stripeInvoiceId: risk.stripeInvoiceId!,
      stripeChargeId: risk.stripeChargeId, stripeStatus: risk.stripeStatus, blocking: risk.blocking,
    }))
    let eligibility: TrialEligibility | null = null
    if (action === "extend_or_grant") {
      eligibility = await resolveTrialEligibility(profile.stripeCustomerId ? stripe() : null, {
        userId: profile.userId, stripeCustomerId: profile.stripeCustomerId,
        stripeSubscriptionId: profile.stripeSubscriptionId, subscriptionStatus: profile.subscriptionStatus,
        billingAccessVersion: profile.billingAccessVersion, pendingTrialOperationId: profile.pendingTrialOperationId,
      }, now(), previousRisks)
      if (!eligibility.available || !eligibility.fingerprint) return fail("trial_eligibility_unavailable", 503)
      if (!eligibility.eligible || !eligibility.source) return fail("trial_ineligible")
    } else if (!grant || grant.revokedAt !== null) return fail("trial_grant_not_current")
    // Revoke cannot increase access: no Stripe dependency, even with debt or an
    // unreadable customer. Expired but unrevoked current rows can also be revoked.
    const observedAt = now()
    const effectiveProfile = eligibility?.snapshot
      ? { ...profile, ...stripeSnapshotProfileData(eligibility.snapshot) }
      : eligibility ? { ...profile, subscriptionStatus: eligibility.billingStatus ?? profile.subscriptionStatus } : profile
    const access = resolveEffectiveAccess({
      platformOwnerAccess: snapshot.platformOwnerAccess,
      profile: effectiveProfile, grant: snapshot.grant,
      billingRisks: eligibility?.risks ?? snapshot.billingRisks,
    }, observedAt)
    const source = eligibility?.source ?? "admin_grant"
    const fingerprint = hash({
      profile: { userId: profile.userId, stripeCustomerId: profile.stripeCustomerId,
        stripeSubscriptionId: profile.stripeSubscriptionId, subscriptionStatus: profile.subscriptionStatus,
        subscriptionTier: profile.subscriptionTier, stripePriceId: profile.stripePriceId,
        trialEndsAt: profile.trialEndsAt, subscriptionCurrentPeriodStart: profile.subscriptionCurrentPeriodStart,
        subscriptionCurrentPeriodEnd: profile.subscriptionCurrentPeriodEnd, subscriptionCancelAt: profile.subscriptionCancelAt,
        subscriptionCancelAtPeriodEnd: profile.subscriptionCancelAtPeriodEnd, stripeScheduleId: profile.stripeScheduleId,
        pendingDowngradeTier: profile.pendingDowngradeTier, version: profile.billingAccessVersion,
        ownerReservation: profile.pendingTrialOperationId, customerReservation: profile.pendingBillingMutationId },
      grant: grant ? { id: grant.id, plan: grant.plan, startsAt: grant.startsAt, expiresAt: grant.expiresAt,
        revokedAt: grant.revokedAt, creatorOperationId: grant.creatorOperationId, lastOperationId: grant.lastOperationId } : null,
      risks: previousRisks.map((risk) => canonical(json(risk))).sort(),
      preflight: eligibility?.fingerprint ?? null, source,
      effective: {
        allowAccess: access.allowAccess, plan: access.effectiveTier, source: access.source,
        expirySource: access.effectiveExpirySource, expiryPlan: access.effectiveExpiryTier,
        // A stale authoritative Stripe trial uses now as an arithmetic floor,
        // not a continuously changing billing fact. Preserve its raw timing here.
        expiresAt: access.trialTimingPendingReconciliation && access.effectiveExpirySource === "stripe_trial"
          ? access.stripeTrialEndsAt : access.effectiveTrialExpiresAt,
        grantEligible: access.grant?.eligible ?? false, restriction: access.restriction,
      },
    })
    return { access, source, fingerprint, observedAt, effectiveProfile, eligibility,
      billingRisks: eligibility?.risks ?? snapshot.billingRisks }
  }

  async function preview(userId: string, raw: unknown): Promise<TrialPreviewResult> {
    const owner = await authorize()
    assertOwner(owner)
    userId = tenantIdSchema.parse(userId)
    const input = normalized(raw), inputHash = hash(input)
    return locked(userId, async (tx, profile) => {
      const existing = await tx.tenantTrialOperation.findUnique({ where: { id: input.operationId } })
      if (existing) {
        identity(existing, owner, userId, inputHash)
        // Resolve replay before version, eligibility, relative time or reservations.
        return project(existing, now())
      }
      if (await tx.tenantBillingMutation.findUnique({ where: { id: input.operationId } })) return fail("trial_operation_key_conflict")
      if (profile.billingAccessVersion !== input.expectedVersion) return fail("trial_preview_stale")
      const observed = await observe(tx, profile, input.action)
      validateTrialAccessSource(input, observed.source)
      let target: Date | null = null
      if (input.action === "extend_or_grant") {
        try {
          target = freezeTrialExpiry(input, { now: observed.observedAt,
            currentEffectiveTrialExpiry: observed.access.effectiveTrialExpiresAt, source: observed.source })
        } catch (error) {
          if (error instanceof RangeError) return fail("trial_expiry_invalid", 400)
          throw error
        }
      }
      assertOwner(owner)
      const op = await tx.tenantTrialOperation.create({ data: {
        id: input.operationId, userId, actorUserId: owner.userId, adminSessionId: owner.adminSession.id,
        inputHash, normalizedInput: json(input), action: input.action, source: observed.source,
        previousSnapshot: json(safeTrialAccessSnapshot(observed.access, observed.effectiveProfile)),
        previousPlan: observed.access.effectiveTier, previousExpiresAt: observed.access.effectiveTrialExpiresAt,
        targetPlan: input.action === "revoke_grant" ? null : input.plan ?? trialAccessPlanSchema.parse(observed.eligibility?.snapshot?.tier),
        targetExpiresAt: target, reason: input.reason, notify: input.notify, timeZone: input.timeZone,
        previewVersion: profile.billingAccessVersion, previewFingerprint: observed.fingerprint,
        previewExpiresAt: new Date(Math.floor(observed.observedAt.getTime() / 1000) * 1000 + TRIAL_PREVIEW_TTL_MS),
        status: "previewed", stripeCustomerId: profile.stripeCustomerId,
        stripeSubscriptionId: observed.eligibility?.snapshot?.subscriptionId ?? profile.stripeSubscriptionId,
      } })
      return project(op, now())
    })
  }

  /**
   * Reusable acceptance seam for 4.3/4.4: caller MUST already hold the tenant lock
   * and persist acceptance in THIS transaction. A returned standalone validation
   * is only a read, never a capability to mutate later outside the lock.
   */
  async function validateConfirmationInTransaction(
    tx: Prisma.TransactionClient, profile: UserProfile, owner: AdminGuardContext, raw: unknown,
  ): Promise<ValidatedTrialPreview> {
    assertOwner(owner)
    const input = trialAccessConfirmationSchema.parse(raw)
    const op = await tx.tenantTrialOperation.findUnique({ where: { id: input.operationId.toLowerCase() } })
    if (!op || op.userId !== profile.userId || op.actorUserId !== owner.userId || op.adminSessionId !== owner.adminSession.id) {
      return fail("trial_operation_not_found", 404)
    }
    if (op.status !== "previewed") return fail("trial_preview_not_confirmable")
    if (now() >= op.previewExpiresAt) return fail("trial_preview_expired")
    if (input.expectedVersion !== op.previewVersion || profile.billingAccessVersion !== op.previewVersion) return fail("trial_preview_stale")
    const stored = normalized(op.normalizedInput)
    if (stored.operationId !== op.id || stored.action !== op.action || hash(stored) !== op.inputHash ||
        stored.expectedVersion !== op.previewVersion || stored.reason !== op.reason || stored.notify !== op.notify ||
        stored.timeZone !== op.timeZone) return fail("trial_preview_corrupt", 503)
    const observed = await observe(tx, profile, op.action)
    assertOwner(owner)
    if (now() >= op.previewExpiresAt) return fail("trial_preview_expired")
    if (observed.source !== op.source || observed.fingerprint !== op.previewFingerprint) return fail("trial_preview_stale")
    validateTrialAccessSource(stored, op.source)
    if (op.action === "extend_or_grant") {
      const plan = stored.action === "extend_or_grant" ? stored.plan ?? observed.eligibility?.snapshot?.tier : null
      if (!op.targetExpiresAt || op.targetPlan !== plan) return fail("trial_preview_corrupt", 503)
      // Verify the frozen target against the immutable normalized intent, using
      // the original second-precision preview instant, NEVER confirmation now.
      const frozen = freezeTrialExpiry(stored as Extract<TrialAccessPreviewInput, { action: "extend_or_grant" }>, {
        now: new Date(op.previewExpiresAt.getTime() - TRIAL_PREVIEW_TTL_MS),
        currentEffectiveTrialExpiry: op.previousExpiresAt, source: op.source,
      })
      if (frozen.getTime() !== op.targetExpiresAt.getTime()) return fail("trial_preview_corrupt", 503)
      try {
        validateFrozenTrialExpiry(op.targetExpiresAt, { now: now(),
          currentEffectiveTrialExpiry: observed.access.effectiveTrialExpiresAt, source: op.source })
      } catch { return fail("trial_preview_stale") }
    } else if (op.targetExpiresAt !== null || op.targetPlan !== null) return fail("trial_preview_corrupt", 503)
    return { operation: op, preview: project(op, now()), effectiveAccess: observed.access,
      effectiveProfile: observed.effectiveProfile, billingRisks: observed.billingRisks }
  }
  async function validateConfirmation(userId: string, raw: unknown): Promise<ValidatedTrialPreview> {
    const owner = await authorize()
    assertOwner(owner)
    userId = tenantIdSchema.parse(userId)
    return locked(userId, (tx, profile) => validateConfirmationInTransaction(tx, profile, owner, raw))
  }
  return { preview, validateConfirmation, validateConfirmationInTransaction }
}