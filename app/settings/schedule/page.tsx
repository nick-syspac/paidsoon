import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { ScheduleSettingsClient } from "@/components/settings/ScheduleSettingsClient"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { getDashboardEffectiveTier } from "@/lib/dashboard/effectiveTier"

export default async function ScheduleSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = getDashboardEffectiveTier(await getDashboardProfile(user.id))
  if (tier === null) redirect("/settings/subscription")
  const schedule = await withUserContext(user.id, (tx) =>
    tx.schedule.findUnique({ where: { userId: user.id } }),
  )

  return (
    <ScheduleSettingsClient
      canCustomizeSequence={hasPlanFeature(
        tier,
        "email_reminder_sequence",
      )}
      schedule={schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 }}
    />
  )
}
