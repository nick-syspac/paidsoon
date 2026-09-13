import type { TenantSnapshot } from "@/lib/admin/tenantSnapshot"
import type { Diagnostic } from "@/lib/admin/diagnostics/types"

/**
 * Check: trial-lapsed
 *
 * Flags when Stripe-synchronized trial state appears lapsed while the tenant
 * remains in "trialing" status.
 */
export function checkTrialLapsed(snapshot: TenantSnapshot): Diagnostic | null {
  const { profile } = snapshot

  if (profile.subscriptionStatus !== "trialing") return null
  if (!profile.trialEndsAt) return null
  if (profile.trialEndsAt > new Date()) return null

  return {
    slug: "trial-lapsed",
    severity: "error",
    title: "Stripe trial period has lapsed",
    description: `The tenant's Stripe-synchronized trial ended on ${profile.trialEndsAt.toLocaleDateString("en-AU")} and their subscription is still in "trialing" status. Review billing state and extend the Stripe trial only if appropriate.`,
    runbookSlug: "trial-lapsed",
    actions: [
      {
        actionSlug: "extend-trial",
        label: "Extend trial 7 days",
        description: "Extend the Stripe subscription trial by 7 days and sync the updated trial end date.",
        payload: { days: 7 },
      },
    ],
  }
}
