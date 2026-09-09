import { NextResponse } from "next/server"
import { z } from "zod"

import { requireOwnersDigestHistoryAccess } from "@/lib/ownersDigest/entitlements"
import { getOwnersDigestById } from "@/lib/ownersDigest/service"
import { createClient } from "@/lib/supabase/server"

const ParamsSchema = z.object({
  digestId: z.string().min(1),
})

export async function GET(
  _request: Request,
  context: { params: Promise<{ digestId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireOwnersDigestHistoryAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const parsed = ParamsSchema.safeParse(await context.params)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const digest = await getOwnersDigestById(user.id, parsed.data.digestId)
    if (!digest) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ digest })
  } catch (error) {
    console.error("[GET /api/owners-digest/[digestId]] Failed to load digest", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
