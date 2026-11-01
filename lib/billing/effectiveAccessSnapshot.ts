import type { PrismaTx } from "@/lib/db/withUserContext"
import { getTxUserProfile } from "@/lib/db/txUserProfile"
import type { Prisma } from "@/lib/generated/prisma/client"
import type { EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"

export interface EffectiveAccessLoadOptions {
  /** Server-owned evaluation instant. Omit to evaluate after the fresh reads. */
  now?: Date
}

export const EFFECTIVE_ACCESS_PROFILE_SELECT = {
  subscriptionStatus: true,
  subscriptionTier: true,
  stripeSubscriptionId: true,
  trialEndsAt: true,
  billingAccessVersion: true,
} as const satisfies Prisma.UserProfileSelect

// Match the authenticated column grants; never select operation/creator IDs.
export const EFFECTIVE_ACCESS_GRANT_SELECT = {
  plan: true,
  startsAt: true,
  expiresAt: true,
  revokedAt: true,
} as const satisfies Prisma.TenantTrialGrantSelect

// Include all facts so unknown nonblocking states also fail closed for grants.
// Provider object/customer/subscription/charge/invoice/event IDs are not readable.
export const EFFECTIVE_ACCESS_RISK_SELECT = {
  kind: true,
  stripeStatus: true,
  blocking: true,
} as const satisfies Prisma.TenantBillingRiskSelect

/** The caller supplies one RLS or privileged transaction, never a global client. */
export async function readEffectiveAccessSnapshot(
  tx: PrismaTx,
  userId: string,
): Promise<EffectiveAccessSnapshot> {
  const userProfile = getTxUserProfile(tx)
  const profile = userProfile
    ? await userProfile.findUnique({
      where: { userId },
      select: EFFECTIVE_ACCESS_PROFILE_SELECT,
    })
    : null

  const tenantTrialGrant = tx && typeof tx === "object" && "tenantTrialGrant" in tx &&
    tx.tenantTrialGrant && typeof tx.tenantTrialGrant === "object" &&
    "findUnique" in tx.tenantTrialGrant && typeof tx.tenantTrialGrant.findUnique === "function"
    ? tx.tenantTrialGrant
    : null
  const grant = tenantTrialGrant
    ? await tenantTrialGrant.findUnique({
      where: { userId },
      select: EFFECTIVE_ACCESS_GRANT_SELECT,
    })
    : null

  const tenantBillingRisk = tx && typeof tx === "object" && "tenantBillingRisk" in tx &&
    tx.tenantBillingRisk && typeof tx.tenantBillingRisk === "object" &&
    "findMany" in tx.tenantBillingRisk && typeof tx.tenantBillingRisk.findMany === "function"
    ? tx.tenantBillingRisk
    : null
  const billingRisks = tenantBillingRisk
    ? await tenantBillingRisk.findMany({
      where: { userId },
      select: EFFECTIVE_ACCESS_RISK_SELECT,
    })
    : []

  const platformOwnerAccess = await readPlatformOwnerAccess(userId)
  return { profile, grant, billingRisks, platformOwnerAccess }
}