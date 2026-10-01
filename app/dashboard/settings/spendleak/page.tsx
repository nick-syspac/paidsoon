import { redirect } from "next/navigation"

import { getSubscriptionTier } from "@/lib/billing"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import { getSpendLeakSourceSettings } from "@/lib/spendleak/sourceSettings"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { SpendLeakSettingsClient } from "@/components/settings/SpendLeakSettingsClient"

export default async function SpendLeakSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessSpendLeak(tier)) {
    redirect("/dashboard/settings/subscription?intent=spendleak")
  }

  const settings = await getSpendLeakSourceSettings(user.id)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">SpendLeak settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure which spend sources your business expects to keep SpendLeak readiness accurate for your workflow.
        </p>
      </div>

      <SpendLeakSettingsClient initialSettings={settings} />
    </div>
  )
}
