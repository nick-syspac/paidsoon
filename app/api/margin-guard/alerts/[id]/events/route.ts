import { NextResponse } from "next/server"

import { requireMarginGuardAlertsAccess } from "@/lib/marginguard/entitlements"
import { listMarginAlertEvents } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireMarginGuardAlertsAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const params = await context.params
    const events = await listMarginAlertEvents(user.id, params.id)
    return NextResponse.json({ events })
  } catch (error) {
    console.error("[GET /api/margin-guard/alerts/:id/events] Failed to load events", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
