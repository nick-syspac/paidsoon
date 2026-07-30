import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"

const patchSchema = z.object({
  displayName: z.string().min(1, "Display name cannot be empty").max(100, "Display name must be 100 characters or fewer"),
})

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const updated = await withUserContext(user.id, (tx) =>
      tx.userProfile.upsert({
        where: { userId: user.id },
        update: { displayName: parsed.data.displayName },
        create: {
          userId: user.id,
          displayName: parsed.data.displayName,
          subscriptionTier: "starter",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
        select: { displayName: true },
      }),
    )
    return NextResponse.json({ displayName: updated.displayName })
  } catch (err) {
    console.error("[PATCH /api/settings/profile] Failed to update display name:", err)
    return NextResponse.json({ error: "Failed to save display name" }, { status: 500 })
  }
}
