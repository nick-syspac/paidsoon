import { redirect } from "next/navigation"

import { getSubscriptionTier } from "@/lib/billing"
import { SettingsNavigation } from "@/components/settings/SettingsNavigation"
import { getVisibleSettingsNavGroups } from "@/lib/settings/navigation"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  const groups = getVisibleSettingsNavGroups(tier)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <SettingsNavigation groups={groups} />

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
