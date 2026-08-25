import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { SubscriptionClient } from "@/components/settings/SubscriptionClient"
import { formatSubscriptionDate } from "@/lib/subscriptionStatusPresentation"
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
  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({
      where: { userId: user.id },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        subscriptionCancelAt: true,
        pendingDowngradeTier: true,
        stripeSubscriptionId: true,
      },
    }),
  )

  const normalizedTier = normalizeSubscriptionTier(profile?.subscriptionTier)
  const status = profile?.subscriptionStatus ?? "active"
  const currentPeriodEnd = profile?.subscriptionCurrentPeriodEnd ?? null
  const subscriptionCancelAt = profile?.subscriptionCancelAt ?? null
  const canCancelSubscription =
    (status === "active" || status === "past_due") &&
    Boolean(profile?.stripeSubscriptionId || currentPeriodEnd)

  const cancellationMessageDate = params.cancelAt
    ? new Date(params.cancelAt)
    : subscriptionCancelAt

  return (
    <SubscriptionClient
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
