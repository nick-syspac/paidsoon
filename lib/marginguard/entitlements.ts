import { getSubscriptionTier, requireFeature } from "@/lib/billing"

export interface MarginGuardEntitlements {
  tier: string
  hasCoreAccess: boolean
  hasCustomerAnalysisAccess: boolean
  hasAlertsAccess: boolean
  hasScenariosAccess: boolean
  hasHistoricalAnalyticsAccess: boolean
}

export async function getMarginGuardEntitlements(userId: string): Promise<MarginGuardEntitlements> {
  const [
    tier,
    hasCoreAccess,
    hasCustomerAnalysisAccess,
    hasAlertsAccess,
    hasScenariosAccess,
    hasHistoricalAnalyticsAccess,
  ] = await Promise.all([
    getSubscriptionTier(userId),
    requireFeature(userId, "marginguard_core"),
    requireFeature(userId, "marginguard_customer_analysis"),
    requireFeature(userId, "marginguard_alerts"),
    requireFeature(userId, "marginguard_scenarios"),
    requireFeature(userId, "marginguard_historical_analytics"),
  ])

  return {
    tier,
    hasCoreAccess,
    hasCustomerAnalysisAccess,
    hasAlertsAccess,
    hasScenariosAccess,
    hasHistoricalAnalyticsAccess,
  }
}

export async function requireMarginGuardCoreAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "marginguard_core")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}

export async function requireMarginGuardAlertsAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "marginguard_alerts")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}

export async function requireMarginGuardScenariosAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "marginguard_scenarios")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}

export async function requireMarginGuardCustomerAnalysisAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "marginguard_customer_analysis")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}
