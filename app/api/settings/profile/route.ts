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

  const updated = await withUserContext(user.id, (tx) =>
    tx.userProfile.update({
      where: { userId: user.id },
      data: { displayName: parsed.data.displayName },
      select: { displayName: true },
    }),
  )

  return NextResponse.json({ displayName: updated.displayName })
}
