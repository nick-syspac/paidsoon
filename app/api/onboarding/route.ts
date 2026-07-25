import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"

const bodySchema = z.object({
  tier: z.enum(["starter", "solo", "small_business", "accountant_partner"]),
})

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

  await withUserContext(user.id, (tx) =>
    tx.userProfile.update({
      where: { userId: user.id },
      data: {
        subscriptionTier: parsed.data.tier,
        onboardingCompletedAt: new Date(),
      },
    }),
  )

  return NextResponse.json({ ok: true })
}
