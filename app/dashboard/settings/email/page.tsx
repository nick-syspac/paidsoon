import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { EmailSettingsClient } from "@/components/settings/EmailSettingsClient"
import { hasPlanFeature } from "@/lib/subscriptionPlans"

export default async function EmailSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const { profile, emailSettings } = await withUserContext(user.id, async (tx) => {
    const [profile, emailSettings] = await Promise.all([
      tx.userProfile.findUnique({ where: { userId: user.id }, select: { subscriptionTier: true } }),
      tx.emailSettings.findUnique({ where: { userId: user.id } }),
    ])
    return { profile, emailSettings }
  })

  return (
    <EmailSettingsClient
      canUseOwnEmail={hasPlanFeature(profile?.subscriptionTier, "own_email_address")}
      settings={emailSettings}
      systemEmail={process.env.RESEND_FROM_EMAIL ?? "billing@paidsoon.com"}
    />
  )
}
