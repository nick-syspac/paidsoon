import { redirect } from "next/navigation"

import { OwnersDigestSettingsClient } from "@/components/settings/OwnersDigestSettingsClient"
import { getSubscriptionTier } from "@/lib/billing"
import { canAccessOwnersDigest } from "@/lib/dashboard/ownersDigestAccess"
import { loadOwnersDigestSettings } from "@/lib/ownersDigest/service"
import { getAuthenticatedUser } from "@/lib/supabase/server"

export default async function OwnersDigestSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessOwnersDigest(tier)) {
    redirect("/dashboard?intent=owners_digest")
  }

  const settings = await loadOwnersDigestSettings(user.id)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Owner&apos;s Digest settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Control digest cadence, attention thresholds, included sections, and delivery preferences.
        </p>
      </div>

      <OwnersDigestSettingsClient settings={settings} />
    </div>
  )
}
