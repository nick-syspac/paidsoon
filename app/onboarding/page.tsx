import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { OnboardingPlanPicker } from "@/components/onboarding/OnboardingPlanPicker"

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/sign-in")

  // Skip onboarding if already completed (idempotent).
  const profile = await withUserContext(user.id, (tx) => tx.userProfile.findUnique({
    where: { userId: user.id },
    select: { onboardingCompletedAt: true, subscriptionStatus: true, stripeSubscriptionId: true },
  }))

  if (profile?.onboardingCompletedAt != null ||
      (profile?.subscriptionStatus === "active" && profile.stripeSubscriptionId)) {
    redirect("/dashboard")
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl">
        <OnboardingPlanPicker />
      </div>
    </div>
  )
}
