import { getSubscriptionTier, requireFeature } from "@/lib/billing"
import type { OwnersDigestEntitlements } from "@/lib/ownersDigest/types"
import { hasPlanFeature } from "@/lib/subscriptionPlans"

export class OwnersDigestAccessError extends Error {
  constructor() {
    super("Upgrade required")
    this.name = "OwnersDigestAccessError"
  }
}

export async function getOwnersDigestEntitlements(userId: string): Promise<OwnersDigestEntitlements> {
  const tier = await getSubscriptionTier(userId)

  return {
    tier,
    hasCoreAccess: tier !== null && hasPlanFeature(tier, "owners_digest_core"),
    hasEmailAccess: tier !== null && hasPlanFeature(tier, "owners_digest_email"),
    hasHistoryAccess: tier !== null && hasPlanFeature(tier, "owners_digest_history"),
  }
}

export async function requireOwnersDigestCoreAccess(userId: string): Promise<void> {
  if (!(await requireFeature(userId, "owners_digest_core"))) {
    throw new OwnersDigestAccessError()
  }
}

export async function requireOwnersDigestHistoryAccess(userId: string): Promise<void> {
  if (!(await requireFeature(userId, "owners_digest_history"))) {
    throw new OwnersDigestAccessError()
  }
}

export async function requireOwnersDigestEmailAccess(userId: string): Promise<void> {
  if (!(await requireFeature(userId, "owners_digest_email"))) {
    throw new OwnersDigestAccessError()
  }
}
