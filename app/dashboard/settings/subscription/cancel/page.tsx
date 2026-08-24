import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { SubscriptionCancellationClient } from "@/components/settings/SubscriptionCancellationClient"
import { getSubscriptionCancellationPageState } from "@/lib/subscriptionStatusPresentation"

export default async function SubscriptionCancellationPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({
      where: { userId: user.id },
      select: {
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        subscriptionCancelAt: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
      },
    }),
  )

  const status = profile?.subscriptionStatus ?? "active"
  const currentPeriodEnd = profile?.subscriptionCurrentPeriodEnd ?? null
  const subscriptionCancelAt = profile?.subscriptionCancelAt ?? null
  const canCancelSubscription =
    (status === "active" || status === "past_due") && Boolean(profile?.stripeSubscriptionId || currentPeriodEnd)
  const isTrialOnly = status === "trialing" && !profile?.stripeSubscriptionId

  const pageState = getSubscriptionCancellationPageState({
    status,
    currentPeriodEnd,
    subscriptionCancelAt,
    canCancelSubscription,
  })

  return <SubscriptionCancellationClient {...pageState} />
}