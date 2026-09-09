import { NextResponse } from "next/server"
import { z } from "zod"

import { requireOwnersDigestHistoryAccess } from "@/lib/ownersDigest/entitlements"
import { listOwnersDigestHistory } from "@/lib/ownersDigest/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(52).optional(),
})

export async function GET(request: Request): Promise<NextResponse> {
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

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({ limit: searchParams.get("limit") ?? undefined })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const history = await listOwnersDigestHistory(user.id, parsed.data.limit)
    return NextResponse.json({ history })
  } catch (error) {
    console.error("[GET /api/owners-digest/history] Failed to load history", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
