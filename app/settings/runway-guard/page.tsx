import { redirect } from "next/navigation"

import { RunwayGuardSettingsClient } from "@/components/settings/RunwayGuardSettingsClient"
import { getSubscriptionTier } from "@/lib/billing"
import { canAccessRunwayGuard } from "@/lib/dashboard/runwayGuardAccess"
import { getRunwayGuardSettings } from "@/lib/runwayGuard/settings"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function RunwayGuardSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessRunwayGuard(tier)) {
    redirect("/dashboard?intent=runwayguard")
  }

  const settings = await getRunwayGuardSettings(user.id)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">RunwayGuard settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure the forecast horizon, risk thresholds, confidence weighting, and protected-cash handling for your runway model.
        </p>
      </div>

      <RunwayGuardSettingsClient
        settings={{
          enabled: settings.enabled,
          horizonDays: settings.horizonDays,
          warningThresholdDays: settings.warningThresholdDays,
          criticalThresholdDays: settings.criticalThresholdDays,
          lowConfidenceWeight: settings.lowConfidenceWeight,
          minimumConfidence: settings.minimumConfidence,
        }}
      />
    </div>
  )
}
