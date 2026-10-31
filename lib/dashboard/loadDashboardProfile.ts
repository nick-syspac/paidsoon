import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import type { Prisma } from "@/lib/generated/prisma/client"
import { resolveEffectiveAccess, type EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { readPlatformOwnerAccess } from "@/lib/billing/platformOwnerAccess"
import {
  EFFECTIVE_ACCESS_PROFILE_SELECT,
  EFFECTIVE_ACCESS_GRANT_SELECT,
  EFFECTIVE_ACCESS_RISK_SELECT,
  type EffectiveAccessLoadOptions,
} from "@/lib/billing/effectiveAccessSnapshot"

export const DASHBOARD_PROFILE_SELECT = {
  ...EFFECTIVE_ACCESS_PROFILE_SELECT,
  displayName: true,
  accountDisplayFromDate: true,
  accountDisplayRevision: true,
  accountDisplayTimeZone: true,
  createdAt: true,
  subscriptionCurrentPeriodStart: true,
  subscriptionCurrentPeriodEnd: true,
  subscriptionCancelAt: true,
  pendingDowngradeTier: true,
} as const satisfies Prisma.UserProfileSelect

export type DashboardProfileFacts = Prisma.UserProfileGetPayload<{
  select: typeof DASHBOARD_PROFILE_SELECT
}>
export type DashboardProfile = DashboardProfileFacts & { effectiveAccess: EffectiveAccess }

/** No cached authorization: evaluate after fresh tenant-scoped reads, including at expiry. */
export async function getDashboardProfile(
  userId: string,
  options: EffectiveAccessLoadOptions = {},
): Promise<DashboardProfile | null> {
  return withUserContext(userId, (tx) => getDashboardProfileWithTx(tx, userId, options))
}

/** Same fresh reads for loaders already inside the authenticated tenant transaction. */
export async function getDashboardProfileWithTx(
  tx: PrismaTx,
  userId: string,
  options: EffectiveAccessLoadOptions = {},
): Promise<DashboardProfile | null> {
  const profile = await tx.userProfile.findUnique({
    where: { userId }, select: DASHBOARD_PROFILE_SELECT,
  })
  if (!profile) return null
  const accountDisplaySetting = await tx.accountDisplaySetting?.findUnique?.({
    where: { userId },
    select: {
      displayFromDate: true,
      revision: true,
      timeZone: true,
    },
  }) ?? null
  const resolvedAccountDisplayFromDate = accountDisplaySetting?.displayFromDate ?? profile.accountDisplayFromDate ?? null
  const resolvedAccountDisplayRevision = accountDisplaySetting?.revision ?? profile.accountDisplayRevision ?? 0
  const resolvedAccountDisplayTimeZone = accountDisplaySetting?.timeZone ?? profile.accountDisplayTimeZone ?? "Australia/Melbourne"
  const grant = await tx.tenantTrialGrant.findUnique({
    where: { userId }, select: EFFECTIVE_ACCESS_GRANT_SELECT,
  })
  const billingRisks = await tx.tenantBillingRisk.findMany({
    where: { userId }, select: EFFECTIVE_ACCESS_RISK_SELECT,
  })
  const platformOwnerAccess = await readPlatformOwnerAccess(userId)
  const resolvedProfile: DashboardProfileFacts = {
    ...profile,
    accountDisplayFromDate: resolvedAccountDisplayFromDate,
    accountDisplayRevision: resolvedAccountDisplayRevision,
    accountDisplayTimeZone: resolvedAccountDisplayTimeZone,
  }
  return {
    ...resolvedProfile,
    effectiveAccess: resolveEffectiveAccess({ profile: resolvedProfile, grant, billingRisks, platformOwnerAccess }, options.now ?? new Date()),
  }
}