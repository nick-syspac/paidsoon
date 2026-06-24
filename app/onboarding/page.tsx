import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prismaAdmin } from "@/lib/db/admin"
import { OnboardingPlanPicker } from "@/components/onboarding/OnboardingPlanPicker"

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/sign-in")

  // Skip onboarding if already completed (idempotent).
  const profile = await prismaAdmin.userProfile.findUnique({
    where: { userId: user.id },
    select: { onboardingCompletedAt: true },
  })

  if (profile?.onboardingCompletedAt != null) {
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
