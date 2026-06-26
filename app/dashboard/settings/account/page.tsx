import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { AccountSettingsClient } from "@/components/settings/AccountSettingsClient"

export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
