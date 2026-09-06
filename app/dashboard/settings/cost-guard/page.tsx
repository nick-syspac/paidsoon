import { redirect } from "next/navigation"

import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { CostGuardSettingsClient } from "@/components/settings/CostGuardSettingsClient"

export default async function CostGuardSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const settings = await withUserContext(user.id, async (tx) =>
    tx.costGuardSetting.findUnique({
      where: { userId: user.id },
      select: {
        materialityPercent: true,
        materialityCents: true,
        alertDigestMode: true,
        defaultLookbackDays: true,
      },
    }),
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Cost Guard settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Tune how aggressively PaidSoon flags unusual spending and how often review digests are sent.
        </p>
      </div>

      <CostGuardSettingsClient settings={settings} />
    </div>
  )
}
