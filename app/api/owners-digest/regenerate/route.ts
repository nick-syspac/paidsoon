import { NextResponse } from "next/server"

import { requireOwnersDigestCoreAccess } from "@/lib/ownersDigest/entitlements"
import { regenerateCurrentOwnersDigest } from "@/lib/ownersDigest/service"
import { createClient } from "@/lib/supabase/server"

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireOwnersDigestCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const digest = await regenerateCurrentOwnersDigest(user.id)
    return NextResponse.json({ digest })
  } catch (error) {
    console.error("[POST /api/owners-digest/regenerate] Failed to regenerate digest", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
