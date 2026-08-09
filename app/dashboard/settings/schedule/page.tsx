import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { ScheduleSettingsClient } from "@/components/settings/ScheduleSettingsClient"
import { hasPlanFeature } from "@/lib/subscriptionPlans"

export default async function ScheduleSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const { profile, schedule } = await withUserContext(user.id, async (tx) => {
    // Sequential, not Promise.all: queries on a single interactive
    // transaction's `tx` share one underlying pg connection.
    const profile = await tx.userProfile.findUnique({ where: { userId: user.id }, select: { subscriptionTier: true } })
    const schedule = await tx.schedule.findUnique({ where: { userId: user.id } })
    return { profile, schedule }
  })

  return (
    <ScheduleSettingsClient
      canCustomizeSequence={hasPlanFeature(
        profile?.subscriptionTier,
        "email_reminder_sequence",
      )}
      schedule={schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 }}
    />
  )
}
