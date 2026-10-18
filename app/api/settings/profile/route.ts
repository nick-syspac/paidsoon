import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { createUserProfile } from "@/lib/actions/auth"
import { NextResponse } from "next/server"
import { z } from "zod"

const patchSchema = z.object({
  displayName: z.string().min(1, "Display name cannot be empty").max(100, "Display name must be 100 characters or fewer"),
}).strict()

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const profile = await withUserContext(user.id, (tx) =>
      tx.userProfile.findUnique({ where: { userId: user.id }, select: { id: true } }),
    )
    // The existing authenticated bootstrap owns trial creation. Name edits never
    // insert billing columns through the customer role or reset a present trial.
    if (!profile) await createUserProfile(user.id)
    const updated = await withUserContext(user.id, (tx) =>
      tx.userProfile.update({
        where: { userId: user.id },
        data: { displayName: parsed.data.displayName },
        select: { displayName: true },
      }),
    )
    return NextResponse.json({ displayName: updated.displayName })
  } catch (err) {
    console.error("[PATCH /api/settings/profile] Failed to update display name:", err)
    return NextResponse.json({ error: "Failed to save display name" }, { status: 500 })
  }
}
