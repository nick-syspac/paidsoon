import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { EmailSettingsClient } from "@/components/settings/EmailSettingsClient"

export default async function EmailSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const [profile, emailSettings] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: user.id }, select: { subscriptionTier: true } }),
    prisma.emailSettings.findUnique({ where: { userId: user.id } }),
  ])

  return (
    <EmailSettingsClient
      isPro={profile?.subscriptionTier === "pro"}
      settings={emailSettings}
      systemEmail={process.env.RESEND_FROM_EMAIL ?? "billing@invoicenudge.com"}
    />
  )
}
