import "server-only"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"
import { prismaAdmin } from "@/lib/db/admin"
import type { AdminGuardContext } from "@/lib/admin/guard"
import { requireTrialAccessOwner } from "@/lib/admin/trialAccessAuthority"
import { projectTrialOutcome } from "@/lib/admin/trialAccessProjection"
import { assertTrialAccessOwner, safeTrialAccessSnapshot, TrialPreviewError, type SafeTrialPreviewSnapshot } from "@/lib/billing/trialAccessPreview"
import type { TrialAccessContact } from "@/lib/email/trialAccessContact"
import { resolveEffectiveAccess } from "@/lib/billing/effectiveAccess"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { resolveTrialEligibility, type TrialBillingRiskEvidence } from "@/lib/billing/trialEligibility"
import { stripeSnapshotProfileData } from "@/lib/billing/stripeSubscriptions"
import { createTrialAccessContactService } from "@/lib/email/trialAccessContactService"

const absent = (): never => { throw new TrialPreviewError("trial_operation_not_found", 404) }

/** Serialized allowlist shared by the owner GET and server-rendered section. */
export interface TrialManagementSnapshot {
  tenant: { displayName: string; labelSource: "display_name" | "tenant_account_fallback" }
  contact: TrialAccessContact
  version: number
  billing: { linked: boolean; plan: string; status: string; stripeTrialEndsAt: string | null;
    periodEndsAt: string | null; cancelAt: string | null; cancelAtPeriodEnd: boolean | null }
  access: SafeTrialPreviewSnapshot
  eligibility: { available: boolean; eligible: boolean; source: "stripe_trial" | "admin_grant" | null;
    restrictions: string[]; resolution: "billing_portal_or_support" | null;
    allowedActions: { extendOrGrant: boolean; revokeGrant: boolean } }
}

/** Narrow owner-only privileged read projections. No audit, outbox initialization,
 * risk backfill, profile refresh writes, reservation, lease or recovery on GET. */
export async function readTrialManagementSnapshot(userId: string): Promise<TrialManagementSnapshot> {
  const owner = await requireTrialAccessOwner()
  const profile = await prismaAdmin.userProfile.findUnique({ where: { userId } })
  if (!profile) return absent()
  const grant = await prismaAdmin.tenantTrialGrant.findUnique({ where: { userId } })
  const risks = await prismaAdmin.tenantBillingRisk.findMany({ where: { userId } })
  // A failed SDK construction is also unavailable evidence, not a debt-free grant.
  const eligibility = await resolveTrialEligibility(
    profile.stripeCustomerId ? (() => { try { return createStripeClient({ maxNetworkRetries: 0 }) } catch { return null } })() : null,
    profile, new Date(), risks.map((risk): TrialBillingRiskEvidence => ({
      kind: risk.kind, stripeObjectId: risk.stripeObjectId, stripeCustomerId: risk.stripeCustomerId,
      stripeSubscriptionId: risk.stripeSubscriptionId, stripeInvoiceId: risk.stripeInvoiceId!,
      stripeChargeId: risk.stripeChargeId, stripeStatus: risk.stripeStatus, blocking: risk.blocking,
    })),
  )
  const freshProfile = eligibility.available && eligibility.snapshot
    ? { ...profile, ...stripeSnapshotProfileData(eligibility.snapshot) }
    : eligibility.available ? { ...profile, subscriptionStatus: eligibility.billingStatus ?? profile.subscriptionStatus } : profile
  const access = resolveEffectiveAccess({ platformOwnerAccess: await readPlatformOwnerAccess(userId), profile: freshProfile, grant,
    billingRisks: eligibility.available ? eligibility.risks : risks }, new Date())
  // Resolve ONLY, never freeze: viewing management must not choose a future mail
  // recipient. The minimal verified contact is intentionally owner-only (D8).
  const contact = await createTrialAccessContactService().resolve(userId)
  assertTrialAccessOwner(owner, new Date())
  const reserved = Boolean(profile.pendingTrialOperationId || profile.pendingBillingMutationId)
  return {
    tenant: { displayName: profile.displayName?.trim() || "Tenant account",
      labelSource: profile.displayName?.trim() ? "display_name" : "tenant_account_fallback" },
    contact: { email: contact.email, name: contact.name, source: contact.source, nameMissing: contact.nameMissing },
    version: profile.billingAccessVersion,
    // Raw persisted Stripe billing remains distinct from grant/effective access.
    billing: { linked: Boolean(profile.stripeCustomerId), plan: profile.subscriptionTier, status: profile.subscriptionStatus,
      stripeTrialEndsAt: profile.trialEndsAt?.toISOString() ?? null,
      periodEndsAt: profile.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
      cancelAt: profile.subscriptionCancelAt?.toISOString() ?? null, cancelAtPeriodEnd: profile.subscriptionCancelAtPeriodEnd },
    access: safeTrialAccessSnapshot(access, freshProfile),
    eligibility: { available: eligibility.available, eligible: eligibility.available && eligibility.eligible && !reserved,
      source: eligibility.available ? eligibility.source : null,
      restrictions: [...eligibility.restrictions, ...(profile.pendingBillingMutationId ? ["billing_operation_in_progress"] : [])],
      resolution: eligibility.resolution,
      allowedActions: { extendOrGrant: eligibility.available && eligibility.eligible && !reserved,
        revokeGrant: Boolean(grant && !grant.revokedAt && !reserved) } },
  }
}

/** The only relaxed session scope is status/recovery. Confirmation and mail retry
 * use originalSession=true; no actor, session or tenant input comes from a body. */
export async function readScopedTrialOperation(userId: string, operationId: string,
  owner: AdminGuardContext, originalSession: boolean): Promise<NonNullable<Awaited<ReturnType<typeof prismaAdmin.tenantTrialOperation.findFirst>>>> {
  assertTrialAccessOwner(owner, new Date())
  const operation = await prismaAdmin.tenantTrialOperation.findFirst({ where: {
    id: operationId, userId, actorUserId: owner.userId,
    ...(originalSession ? { adminSessionId: owner.adminSession.id } : {}),
  } })
  if (!operation) return absent()
  return operation
}

export async function readTrialOperationStatus(userId: string, operationId: string, owner: AdminGuardContext) {
  const op = await readScopedTrialOperation(userId, operationId, owner, false)
  const notification = await prismaAdmin.tenantTrialNotification.findFirst({ where: { userId, operationId } , select: { status: true } })
  const result = op.result ? projectTrialOutcome(op.result) : null
  assertTrialAccessOwner(owner, new Date())
  // Stored access result stays immutable; delivery is a separate current field.
  return { operationId: op.id, action: op.action, source: op.source,
    status: op.status === "previewed" && op.previewExpiresAt <= new Date() ? "expired_preview" : op.status,
    result, notificationStatus: notification?.status ?? "not_requested",
    reconciliationRequired: ["pending", "reconciliation_required"].includes(op.status),
    canReconcile: op.source === "stripe_trial" && ["pending", "reconciliation_required"].includes(op.status),
    createdAt: op.createdAt.toISOString(), completedAt: op.completedAt?.toISOString() ?? null }
}