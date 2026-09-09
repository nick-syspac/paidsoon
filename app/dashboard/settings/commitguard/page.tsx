import { redirect } from "next/navigation"

import { CommitGuardSettingsClient } from "@/components/settings/CommitGuardSettingsClient"
import { getSubscriptionTier } from "@/lib/billing"
import { getCommitGuardSettings } from "@/lib/commitguard/service"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function CommitGuardSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!hasPlanFeature(tier, "commitguard_core")) {
    redirect("/dashboard?intent=commitguard")
  }

  const settings = await getCommitGuardSettings(user.id)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">CommitGuard settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure safety buffers, recurring commitment detection thresholds, and commitment alert preferences.
        </p>
      </div>

      <CommitGuardSettingsClient settings={settings} />
    </div>
  )
}
