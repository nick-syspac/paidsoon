import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardCustomerAnalysisAccess } from "@/lib/marginguard/entitlements"
import { getMarginCustomers } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  period: z.enum(["30d", "3m", "6m", "12m", "fy"]).optional(),
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
    await requireMarginGuardCustomerAnalysisAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({ period: searchParams.get("period") ?? undefined })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const customers = await getMarginCustomers(user.id, parsed.data.period)
    return NextResponse.json({ customers })
  } catch (error) {
    console.error("[GET /api/margin-guard/customers] Failed to load customer profitability", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
