import { redirect } from "next/navigation"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { getDashboardEffectiveTier } from "@/lib/dashboard/effectiveTier"
import { AccountSettingsClient } from "@/components/settings/AccountSettingsClient"

export default async function AccountSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const profile = await getDashboardProfile(user.id)
  const tier = getDashboardEffectiveTier(profile)
  if (tier === null) redirect("/settings/subscription")

  return (
    <AccountSettingsClient
      email={user.email ?? ""}
      displayName={profile?.displayName ?? null}
      accountDisplayFromDate={profile?.accountDisplayFromDate ?? null}
      accountDisplayRevision={profile?.accountDisplayRevision ?? 0}
      tier={tier}
      status={profile?.subscriptionStatus ?? "unknown"}
      createdAt={profile?.createdAt ?? new Date()}
    />
  )
}
