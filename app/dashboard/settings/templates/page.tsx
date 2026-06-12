import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { hasPlanFeature, normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { TemplatesClient } from "@/components/settings/TemplatesClient"

export default async function TemplatesSettingsPage() {
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
  const hasBasic = hasPlanFeature(tier, "basic_templates")
  const canCustomize = hasPlanFeature(tier, "custom_reminder_templates")

  if (!hasBasic) {
    return (
      <div className="max-w-lg bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm text-gray-600">
        Your current plan does not include templates.
      </div>
    )
  }

  return (
    <TemplatesClient
      data={{
        tier,
        templates: [
          { id: "gentle-reminder", label: "Gentle reminder" },
          { id: "payment-followup", label: "Payment follow-up" },
        ],
        canCustomize,
      }}
    />
  )
}
