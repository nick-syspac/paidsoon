import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { createClient } from "@/lib/supabase/server"
import { listTaxBufferObligations } from "@/lib/taxBuffer/service"

const QuerySchema = z.object({
  horizonDays: z.coerce.number().int().refine((value) => value === 30 || value === 60 || value === 90, {
    message: "horizonDays must be 30, 60, or 90",
  }).default(90),
  status: z.string().trim().min(1).optional(),
  sortBy: z.enum(["dueDate", "estimatedAmountCents", "reservedAmountCents"]).default("dueDate"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
})

export async function GET(request: Request): Promise<NextResponse> {
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

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    horizonDays: searchParams.get("horizonDays") ?? 90,
    status: searchParams.get("status") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? "dueDate",
    sortOrder: searchParams.get("sortOrder") ?? "asc",
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const obligations = await listTaxBufferObligations({
      userId: user.id,
      horizonDays: parsed.data.horizonDays,
      status: parsed.data.status,
      sortBy: parsed.data.sortBy,
      sortOrder: parsed.data.sortOrder,
    })
    return NextResponse.json(obligations)
  } catch (error) {
    console.error("[GET /api/tax-buffer/obligations] Failed to load obligations", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
