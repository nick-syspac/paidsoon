import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { hasPlanFeature, type SubscriptionFeature } from "@/lib/subscriptionPlans"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"

export type FinancialJobFeature = SubscriptionFeature | "spendleak" | null
export type FinancialJobSkip = { status: "skipped"; reason: "no_access" | "feature_not_available" }

/** Only interprets the central resolver's result; never derives billing eligibility. */
export function financialJobAccessSkip(
  access: EffectiveAccess | undefined,
  feature: FinancialJobFeature,
): FinancialJobSkip | null {
  if (!access?.allowAccess || access.effectiveTier === null) {
    return { status: "skipped", reason: "no_access" }
  }
  if (feature !== null && !(feature === "spendleak"
    ? canAccessSpendLeak(access.effectiveTier)
    : hasPlanFeature(access.effectiveTier, feature))) {
    return { status: "skipped", reason: "feature_not_available" }
  }
  return null
}

/** Authenticated system execution only. No queued tier or cross-job cache. */
export async function getFinancialJobAccessSkip(
  userId: string,
  feature: FinancialJobFeature,
): Promise<FinancialJobSkip | null> {
  const { getEffectiveAccessForSystem } = await import("@/lib/billing/effectiveAccessSystem")
  return financialJobAccessSkip(await getEffectiveAccessForSystem(userId), feature)
}

/** Three reads for the entire candidate cohort, not three reads per denied tenant.
 * Allowed candidates still reauthorize at computation time (the serial queue may
 * outlive a grant, or a grant may be revoked after selection).
 */
export async function getFinancialJobCandidates(userIds: readonly string[], feature: FinancialJobFeature) {
  const { getEffectiveAccessForUsersForSystem } = await import("@/lib/billing/effectiveAccessSystem")
  const access = await getEffectiveAccessForUsersForSystem(userIds)
  return new Map(userIds.map((id) => [id, financialJobAccessSkip(access.get(id), feature)]))
}