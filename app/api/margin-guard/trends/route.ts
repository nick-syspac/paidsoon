import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardCoreAccess } from "@/lib/marginguard/entitlements"
import { getMarginTrends } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  period: z.enum(["30d", "3m", "6m", "12m", "fy"]).optional(),
  compare: z.enum(["none", "previous_period"]).default("none"),
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
    await requireMarginGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    period: searchParams.get("period") ?? undefined,
    compare: searchParams.get("compare") ?? "none",
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const trends = await getMarginTrends(user.id, parsed.data.period, parsed.data.compare)
    return NextResponse.json({ trends })
  } catch (error) {
    console.error("[GET /api/margin-guard/trends] Failed to load trends", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
