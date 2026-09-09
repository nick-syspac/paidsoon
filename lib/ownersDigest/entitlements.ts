import { getSubscriptionTier, requireFeature } from "@/lib/billing"
import type { OwnersDigestEntitlements } from "@/lib/ownersDigest/types"

export async function getOwnersDigestEntitlements(userId: string): Promise<OwnersDigestEntitlements> {
  const [tier, hasCoreAccess, hasEmailAccess, hasHistoryAccess] = await Promise.all([
    getSubscriptionTier(userId),
    requireFeature(userId, "owners_digest_core"),
    requireFeature(userId, "owners_digest_email"),
    requireFeature(userId, "owners_digest_history"),
  ])

  return {
    tier,
    hasCoreAccess,
    hasEmailAccess,
    hasHistoryAccess,
  }
}

export async function requireOwnersDigestCoreAccess(userId: string): Promise<void> {
  if (!(await requireFeature(userId, "owners_digest_core"))) {
    throw new Error("Upgrade required")
  }
}

export async function requireOwnersDigestHistoryAccess(userId: string): Promise<void> {
  if (!(await requireFeature(userId, "owners_digest_history"))) {
    throw new Error("Upgrade required")
  }
}

export async function requireOwnersDigestEmailAccess(userId: string): Promise<void> {
  if (!(await requireFeature(userId, "owners_digest_email"))) {
    throw new Error("Upgrade required")
  }
}
