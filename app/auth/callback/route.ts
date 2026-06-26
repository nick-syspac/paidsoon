import { createClient } from "@/lib/supabase/server"
import { createUserProfile } from "@/lib/actions/auth"
import { prismaAdmin } from "@/lib/db/admin"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      await createUserProfile(data.user.id)
      // Route new users (trialing, onboarding not yet complete) to /onboarding.
      const profile = await prismaAdmin.userProfile.findUnique({
        where: { userId: data.user.id },
        select: { subscriptionStatus: true, onboardingCompletedAt: true },
      })
      const isNewTrialUser =
        profile?.subscriptionStatus === "trialing" &&
        profile?.onboardingCompletedAt === null
      const redirectTo = isNewTrialUser ? "/onboarding" : next
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
}
