import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { EmailSettingsClient } from "@/components/settings/EmailSettingsClient"
import { hasPlanFeature } from "@/lib/subscriptionPlans"

export default async function EmailSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const { profile, emailSettings } = await withUserContext(user.id, async (tx) => {
    // Sequential, not Promise.all: queries on a single interactive
    // transaction's `tx` share one underlying pg connection.
    const profile = await tx.userProfile.findUnique({ where: { userId: user.id }, select: { subscriptionTier: true } })
    const emailSettings = await tx.emailSettings.findUnique({ where: { userId: user.id } })
    return { profile, emailSettings }
  })

  return (
    <EmailSettingsClient
      canUseCustomReplyTo={hasPlanFeature(profile?.subscriptionTier, "custom_reply_to")}
      canUseCustomSenderName={hasPlanFeature(profile?.subscriptionTier, "custom_sender_name")}
      canUseVerifiedDomain={hasPlanFeature(profile?.subscriptionTier, "verified_from_domain")}
      settings={emailSettings}
      systemEmail={process.env.RESEND_FROM_EMAIL ?? "billing@paidsoon.com"}
    />
  )
}
