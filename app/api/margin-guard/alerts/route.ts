import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardAlertsAccess } from "@/lib/marginguard/entitlements"
import { listMarginAlerts } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved", "dismissed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
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
    await requireMarginGuardAlertsAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? 25,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const alerts = await listMarginAlerts(user.id, parsed.data.status, parsed.data.limit)
    return NextResponse.json({ alerts })
  } catch (error) {
    console.error("[GET /api/margin-guard/alerts] Failed to load alerts", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
