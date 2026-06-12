import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { hasPlanFeature, normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { AiSettingsClient } from "@/components/settings/AiSettingsClient"

export default async function AiSettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({
      where: { userId: user.id },
      select: { subscriptionTier: true },
    }),
  )

  const tier = normalizeSubscriptionTier(profile?.subscriptionTier)

  return (
    <AiSettingsClient
      flags={{
        canRewrite: hasPlanFeature(tier, "ai_rewrite"),
        canSetTone: hasPlanFeature(tier, "tone_settings"),
      }}
    />
  )
}
