import { getSubscriptionTier, requireFeature } from "@/lib/billing"

export interface RunwayGuardEntitlements {
  tier: string
  hasCoreAccess: boolean
  hasScenarioAccess: boolean
}

export async function getRunwayGuardEntitlements(userId: string): Promise<RunwayGuardEntitlements> {
  const [tier, hasCoreAccess, hasScenarioAccess] = await Promise.all([
    getSubscriptionTier(userId),
    requireFeature(userId, "runwayguard_core"),
    requireFeature(userId, "runwayguard_scenarios"),
  ])

  return {
    tier,
    hasCoreAccess,
    hasScenarioAccess,
  }
}

export async function requireRunwayGuardCoreAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "runwayguard_core")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}

export async function requireRunwayGuardScenarioAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "runwayguard_scenarios")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}
