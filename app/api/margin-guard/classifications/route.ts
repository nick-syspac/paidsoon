import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardCoreAccess } from "@/lib/marginguard/entitlements"
import { listMarginClassifications } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  sourceType: z.enum(["imported_bill", "imported_bank_transaction", "financial_invoice"]).optional(),
  classification: z.enum(["DIRECT_COST", "VARIABLE_COST", "OVERHEAD", "EXCLUDED", "UNCLASSIFIED"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
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
    sourceType: searchParams.get("sourceType") ?? undefined,
    classification: searchParams.get("classification") ?? undefined,
    limit: searchParams.get("limit") ?? 100,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const classifications = await listMarginClassifications(user.id, parsed.data)
    return NextResponse.json({ classifications })
  } catch (error) {
    console.error("[GET /api/margin-guard/classifications] Failed to load classifications", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
