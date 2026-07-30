import type { TenantSnapshot } from "@/lib/admin/tenantSnapshot"
import type { Diagnostic } from "@/lib/admin/diagnostics/types"

/**
 * Check: trial-lapsed
 *
 * Flags when a tenant's trial period has expired but their subscription
 * status is still "trialing" (i.e. they have not upgraded or been
 * automatically moved to active).
 */
export function checkTrialLapsed(snapshot: TenantSnapshot): Diagnostic | null {
  const { profile } = snapshot

  if (profile.subscriptionStatus !== "trialing") return null
  if (!profile.trialEndsAt) return null
  if (profile.trialEndsAt > new Date()) return null

  return {
    slug: "trial-lapsed",
    severity: "error",
    title: "Trial period has lapsed",
    description: `The tenant's trial ended on ${profile.trialEndsAt.toLocaleDateString("en-AU")} and their subscription is still in "trialing" status. They may be unable to send follow-up emails.`,
    runbookSlug: "trial-lapsed",
    actions: [
      {
        actionSlug: "extend-trial",
        label: "Extend trial 7 days",
        description: "Add 7 days to the trial end date to give the tenant more time to upgrade.",
        payload: { days: 7 },
      },
    ],
  }
}
