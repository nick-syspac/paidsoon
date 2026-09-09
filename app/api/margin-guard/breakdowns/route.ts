import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardCoreAccess } from "@/lib/marginguard/entitlements"
import { getMarginBreakdowns } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  period: z.enum(["30d", "3m", "6m", "12m", "fy"]).optional(),
  dimension: z.enum(["customer", "invoice", "accounting_source"]).default("customer"),
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
    dimension: searchParams.get("dimension") ?? "customer",
  })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const breakdowns = await getMarginBreakdowns(user.id, parsed.data.dimension, parsed.data.period)
    return NextResponse.json({ breakdowns })
  } catch (error) {
    console.error("[GET /api/margin-guard/breakdowns] Failed to load breakdowns", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
