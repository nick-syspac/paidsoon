import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { createClient } from "@/lib/supabase/server"
import { listTaxBufferOverrides, saveTaxBufferOverride } from "@/lib/taxBuffer/service"

const OverrideSchema = z
  .object({
    reserveCategoryId: z.string().trim().min(1).optional(),
    obligationId: z.string().trim().min(1).optional(),
    calculatedValueCents: z.number().int().min(0),
    overrideValueCents: z.number().int().min(0),
    reason: z.string().trim().min(3).max(500),
    basedOnAccountant: z.boolean().default(false),
  })
  .strict()
  .refine((value) => Boolean(value.reserveCategoryId || value.obligationId), {
    message: "reserveCategoryId or obligationId is required",
    path: ["reserveCategoryId"],
  })

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
    const overrides = await listTaxBufferOverrides(user.id)
    return NextResponse.json({ overrides })
  } catch (error) {
    console.error("[GET /api/tax-buffer/overrides] Failed to load overrides", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
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

  const parsed = OverrideSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const override = await saveTaxBufferOverride({
      userId: user.id,
      reserveCategoryId: parsed.data.reserveCategoryId,
      obligationId: parsed.data.obligationId,
      calculatedValueCents: parsed.data.calculatedValueCents,
      overrideValueCents: parsed.data.overrideValueCents,
      reason: parsed.data.reason,
      basedOnAccountant: parsed.data.basedOnAccountant,
      createdBy: user.id,
    })

    return NextResponse.json({ override })
  } catch (error) {
    console.error("[POST /api/tax-buffer/overrides] Failed to save override", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
