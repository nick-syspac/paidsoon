import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { ScheduleSettingsClient } from "@/components/settings/ScheduleSettingsClient"

export default async function ScheduleSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const { profile, schedule } = await withUserContext(user.id, async (tx) => {
    const [profile, schedule] = await Promise.all([
      tx.userProfile.findUnique({ where: { userId: user.id }, select: { subscriptionTier: true } }),
      tx.schedule.findUnique({ where: { userId: user.id } }),
    ])
    return { profile, schedule }
  })

  return (
    <ScheduleSettingsClient
      isPro={profile?.subscriptionTier === "pro"}
      schedule={schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 }}
    />
  )
}
