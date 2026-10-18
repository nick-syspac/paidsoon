import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"

const bodySchema = z.object({
  tier: z.enum(["essentials", "business_control", "small_business", "business_pro"]),
}).strict()

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 })
  }

  // The validated tier is purchase intent only. Signup/grants/Stripe own access.
  try {
    await withUserContext(user.id, (tx) =>
      tx.userProfile.update({
        where: { userId: user.id },
        data: { onboardingCompletedAt: new Date() },
        select: { onboardingCompletedAt: true },
      }),
    )
  } catch {
    return NextResponse.json({ error: "Unable to complete onboarding. Please try again." }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
