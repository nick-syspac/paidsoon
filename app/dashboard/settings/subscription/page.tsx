import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { SubscriptionClient } from "@/components/settings/SubscriptionClient"
import { getPlanByTier, normalizeSubscriptionTier } from "@/lib/subscriptionPlans"

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string; tier?: string; plan?: string }>
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
        pendingDowngradeTier: true,
      },
    }),
  )

  return (
    <SubscriptionClient
      tier={normalizeSubscriptionTier(profile?.subscriptionTier)}
      status={profile?.subscriptionStatus ?? "active"}
      currentPeriodEnd={profile?.subscriptionCurrentPeriodEnd ?? null}
      pendingDowngradeTier={profile?.pendingDowngradeTier ? normalizeSubscriptionTier(profile.pendingDowngradeTier) : null}
      preselectedTier={normalizeSubscriptionTier(params.plan ?? null) ?? undefined}
      successMessage={
        params.success === "upgraded"
          ? `Subscription updated to ${getPlanByTier(params.tier).name}.`
          : null
      }
    />
  )
}
