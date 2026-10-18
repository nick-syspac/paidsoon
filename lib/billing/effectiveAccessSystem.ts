import "server-only"
import { prismaAdmin } from "@/lib/db/admin"
import { readPlatformOwnerAccessForUsers } from "@/lib/billing/platformOwnerAccess"
import {
  resolveEffectiveAccess,
  type BillingRiskSnapshot,
  type EffectiveAccess,
} from "@/lib/billing/effectiveAccess"
import {
  EFFECTIVE_ACCESS_PROFILE_SELECT,
  EFFECTIVE_ACCESS_GRANT_SELECT,
  EFFECTIVE_ACCESS_RISK_SELECT,
  readEffectiveAccessSnapshot,
  type EffectiveAccessLoadOptions,
} from "@/lib/billing/effectiveAccessSnapshot"

/**
 * Intentional read-only RLS bypass for authenticated system jobs or guarded admin
 * services without a customer session. Callers enforce their job/admin guard;
 * customer requests must use getEffectiveAccess instead. Every read is scoped to
 * the supplied tenant(s), and no provider or operation internals are returned.
 */
export async function getEffectiveAccessForSystem(
  userId: string,
  options: EffectiveAccessLoadOptions = {},
): Promise<EffectiveAccess> {
  const snapshot = await prismaAdmin.$transaction((tx) =>
    readEffectiveAccessSnapshot(tx, userId),
  )
  return resolveEffectiveAccess(snapshot, options.now ?? new Date())
}

/** Three tenant-fact reads plus one narrow role batch, never queries per tenant. */
export async function getEffectiveAccessForUsersForSystem(
  userIds: readonly string[],
  options: EffectiveAccessLoadOptions = {},
): Promise<Map<string, EffectiveAccess>> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Map()

  const { profiles, grants, risks } = await prismaAdmin.$transaction(async (tx) => {
    const where = { userId: { in: ids } }
    const profiles = await tx.userProfile.findMany({
      where,
      select: { userId: true, ...EFFECTIVE_ACCESS_PROFILE_SELECT },
    })
    const grants = await tx.tenantTrialGrant.findMany({
      where,
      select: { userId: true, ...EFFECTIVE_ACCESS_GRANT_SELECT },
    })
    const risks = await tx.tenantBillingRisk.findMany({
      where,
      select: { userId: true, ...EFFECTIVE_ACCESS_RISK_SELECT },
    })
    return { profiles, grants, risks }
  })

  const owners = await readPlatformOwnerAccessForUsers(ids)
  const now = options.now ?? new Date()
  const profilesByUser = new Map(profiles.map(({ userId, ...profile }) => [userId, profile]))
  const grantsByUser = new Map(grants.map(({ userId, ...grant }) => [userId, grant]))
  const risksByUser = new Map<string, BillingRiskSnapshot[]>()
  for (const { userId, ...risk } of risks) {
    const facts = risksByUser.get(userId) ?? []
    facts.push(risk)
    risksByUser.set(userId, facts)
  }
  return new Map(ids.map((userId) => [userId, resolveEffectiveAccess({
    platformOwnerAccess: owners.has(userId),
    profile: profilesByUser.get(userId) ?? null,
    grant: grantsByUser.get(userId) ?? null,
    billingRisks: risksByUser.get(userId) ?? [],
  }, now)]))
}