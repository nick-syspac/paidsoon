import { NextResponse } from "next/server"

import { requireFeature } from "@/lib/billing"
import { createClient } from "@/lib/supabase/server"
import { loadTaxBufferSummary } from "@/lib/taxBuffer/service"

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasFeature = await requireFeature(user.id, "tax_buffer_basic")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const summary = await loadTaxBufferSummary(user.id)
    return NextResponse.json({ summary })
  } catch (error) {
    console.error("[GET /api/tax-buffer/summary] Failed to load summary", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
