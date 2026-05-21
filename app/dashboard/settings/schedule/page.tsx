import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { ScheduleSettingsClient } from "@/components/settings/ScheduleSettingsClient"

export default async function ScheduleSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const [profile, schedule] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id }, select: { subscriptionTier: true } }),
    prisma.schedule.findUnique({ where: { userId: user.id } }),
  ])

  return (
    <ScheduleSettingsClient
      isPro={profile?.subscriptionTier === "pro"}
      schedule={schedule ?? { email1DaysAfterDue: 3, email2DaysAfterDue: 10, email3DaysAfterDue: 21 }}
    />
  )
}
