import type { PrismaTx } from "@/lib/db/withUserContext"
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
  const profile = await tx.userProfile.findUnique({
    where: { userId },
    select: EFFECTIVE_ACCESS_PROFILE_SELECT,
  })
  const grant = await tx.tenantTrialGrant.findUnique({
    where: { userId },
    select: EFFECTIVE_ACCESS_GRANT_SELECT,
  })
  const billingRisks = await tx.tenantBillingRisk.findMany({
    where: { userId },
    select: EFFECTIVE_ACCESS_RISK_SELECT,
  })
  const platformOwnerAccess = await readPlatformOwnerAccess(userId)
  return { profile, grant, billingRisks, platformOwnerAccess }
}