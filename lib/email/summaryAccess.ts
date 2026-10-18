import { getEffectiveAccessForSystem } from "@/lib/billing/effectiveAccessSystem"
import { hasPlanFeature } from "@/lib/subscriptionPlans"

export type SummaryAccessSkip = {
  status: "skipped"
  reason: "no_access" | "weekly_summary_not_available" | "owners_digest_email_not_available"
}

/** Authenticated system execution only. Never reuse a queued tier or snapshot.
 * Keep catalog entitlements distinct from presentation/production readiness flags.
 */
export async function getSummaryAccessSkip(
  userId: string,
  feature: "weekly_summary_email" | "owners_digest_email",
): Promise<SummaryAccessSkip | null> {
  const access = await getEffectiveAccessForSystem(userId)
  if (!access.allowAccess || access.effectiveTier === null) {
    return { status: "skipped", reason: "no_access" }
  }
  if (!hasPlanFeature(access.effectiveTier, feature) ||
    (feature === "owners_digest_email" && !hasPlanFeature(access.effectiveTier, "owners_digest_core"))) {
    return { status: "skipped", reason: feature === "weekly_summary_email"
      ? "weekly_summary_not_available" : "owners_digest_email_not_available" }
  }
  return null
}