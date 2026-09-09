import {
  getCommitmentDetectionCandidateLimitForTier,
  getCommitmentLimitForTier,
  getSubscriptionTier,
  requireFeature,
} from "@/lib/billing"

export interface CommitGuardEntitlements {
  tier: string
  hasCoreAccess: boolean
  hasDetectionAccess: boolean
  hasAdvancedAlertsAccess: boolean
  commitmentsTrackedLimit: number
  detectionCandidatesPerCycleLimit: number
}

export async function getCommitGuardEntitlements(userId: string): Promise<CommitGuardEntitlements> {
  const [tier, hasCoreAccess, hasDetectionAccess, hasAdvancedAlertsAccess] = await Promise.all([
    getSubscriptionTier(userId),
    requireFeature(userId, "commitguard_core"),
    requireFeature(userId, "commitguard_detection"),
    requireFeature(userId, "commitguard_advanced_alerts"),
  ])

  return {
    tier,
    hasCoreAccess,
    hasDetectionAccess,
    hasAdvancedAlertsAccess,
    commitmentsTrackedLimit: getCommitmentLimitForTier(tier),
    detectionCandidatesPerCycleLimit: getCommitmentDetectionCandidateLimitForTier(tier),
  }
}

export async function requireCommitGuardCoreAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "commitguard_core")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}

export async function requireCommitGuardDetectionAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "commitguard_detection")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}

export async function requireCommitGuardAdvancedAlertsAccess(userId: string): Promise<void> {
  const hasAccess = await requireFeature(userId, "commitguard_advanced_alerts")
  if (!hasAccess) {
    throw new Error("Upgrade required")
  }
}
