import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { redirect } from "next/navigation"
import { SubscriptionClient } from "@/components/settings/SubscriptionClient"
import { formatSubscriptionDate, getApplicationAccessPresentation } from "@/lib/subscriptionStatusPresentation"
import { getBillingClientScope } from "@/lib/billing/billingClientSession"
import {
  getPlanByTier,
  getPublicPlanSelectionIntent,
  normalizeSubscriptionTier,
} from "@/lib/subscriptionPlans"

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string
    cancelled?: string
    cancellation?: string
    cancelAt?: string
    tier?: string
    plan?: string
  }>
}) {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const params = await searchParams
  const profile = await getDashboardProfile(user.id)

  const normalizedTier = normalizeSubscriptionTier(profile?.subscriptionTier)
  const status = profile?.subscriptionStatus ?? "unknown"
  const currentPeriodEnd = profile?.subscriptionCurrentPeriodEnd ?? null
  const subscriptionCancelAt = profile?.subscriptionCancelAt ?? null
  const canCancelSubscription =
    (status === "active" || status === "trialing" || status === "past_due" || status === "unpaid") &&
    Boolean(profile?.stripeSubscriptionId || currentPeriodEnd)

  const cancellationMessageDate = params.cancelAt
    ? new Date(params.cancelAt)
    : subscriptionCancelAt

  return (
    <SubscriptionClient
      billingAccessVersion={profile?.billingAccessVersion ?? null}
      billingSessionScope={await getBillingClientScope(user.id)}
      applicationAccess={getApplicationAccessPresentation(profile?.effectiveAccess ?? null)}
      stripeTrialEndsAt={profile?.effectiveAccess.stripeTrialEndsAt ?? null}
      hasStripeSubscription={Boolean(profile?.stripeSubscriptionId)}
      tier={normalizedTier}
      status={status}
      currentPeriodEnd={currentPeriodEnd}
      subscriptionCancelAt={subscriptionCancelAt}
      canCancelSubscription={canCancelSubscription}
      pendingDowngradeTier={profile?.pendingDowngradeTier ? normalizeSubscriptionTier(profile.pendingDowngradeTier) : null}
      preselectedTier={getPublicPlanSelectionIntent(params.plan)}
      successMessage={
        params.success === "upgraded"
          ? `Subscription updated to ${getPlanByTier(params.tier).name}.`
          : params.cancellation === "ended"
            ? "Your free trial has ended."
          : params.cancellation === "scheduled"
            ? cancellationMessageDate
              ? `Your cancellation is scheduled for ${formatSubscriptionDate(cancellationMessageDate)}.`
              : "Your cancellation is scheduled."
          : null
      }
    />
  )
}
