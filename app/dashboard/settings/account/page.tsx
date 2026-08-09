import { redirect } from "next/navigation"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { AccountSettingsClient } from "@/components/settings/AccountSettingsClient"

export default async function AccountSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({
      where: { userId: user.id },
      select: {
        displayName: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        createdAt: true,
      },
    }),
  )

  return (
    <AccountSettingsClient
      email={user.email ?? ""}
      displayName={profile?.displayName ?? null}
      tier={normalizeSubscriptionTier(profile?.subscriptionTier)}
      status={profile?.subscriptionStatus ?? "active"}
      createdAt={profile?.createdAt ?? new Date()}
    />
  )
}
