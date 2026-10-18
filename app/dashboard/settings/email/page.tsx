import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { EmailSettingsClient } from "@/components/settings/EmailSettingsClient"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { getDashboardEffectiveTier } from "@/lib/dashboard/effectiveTier"

export default async function EmailSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = getDashboardEffectiveTier(await getDashboardProfile(user.id))
  if (tier === null) redirect("/dashboard/settings/subscription")
  const emailSettings = await withUserContext(user.id, (tx) =>
    tx.emailSettings.findUnique({ where: { userId: user.id } }),
  )

  return (
    <EmailSettingsClient
      canUseCustomReplyTo={hasPlanFeature(tier, "custom_reply_to")}
      canUseCustomSenderName={hasPlanFeature(tier, "custom_sender_name")}
      canUseVerifiedDomain={hasPlanFeature(tier, "verified_from_domain")}
      settings={emailSettings}
      systemEmail={process.env.RESEND_FROM_EMAIL ?? "billing@paidsoon.com"}
    />
  )
}
