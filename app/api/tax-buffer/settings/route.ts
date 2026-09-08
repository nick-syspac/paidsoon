import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { createClient } from "@/lib/supabase/server"
import { getTaxBufferSettings, saveTaxBufferSettings } from "@/lib/taxBuffer/service"

const SettingsSchema = z.object({
  enabled: z.boolean(),
  accountingBasis: z.enum(["cash", "accrual"]),
  businessType: z.string().trim().min(1).max(80),
  gstRegistered: z.boolean(),
  gstFrequency: z.enum(["monthly", "quarterly", "annually"]),
  reserveBalanceSource: z.enum(["manual", "connected_account"]),
  reserveBalanceCents: z.number().int().min(0),
  reserveAccountName: z.string().trim().max(120).optional().nullable(),
  categories: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        enabled: z.boolean(),
        calculationMethod: z.enum([
          "integration",
          "fixed_amount",
          "percentage_profit",
          "percentage_revenue",
          "manual",
        ]),
        recurrence: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "annually", "one_off"]),
        ratePercent: z.number().min(0).max(100).optional().nullable(),
        fixedAmountCents: z.number().int().min(0).optional().nullable(),
        manualAmountCents: z.number().int().min(0).optional().nullable(),
      }),
    )
    .optional(),
}).strict()

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
    const data = await getTaxBufferSettings(user.id)
    return NextResponse.json(data)
  } catch (error) {
    console.error("[GET /api/tax-buffer/settings] Failed to load settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
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

  const parsed = SettingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const configuration = await saveTaxBufferSettings(user.id, parsed.data)
    return NextResponse.json({ configuration })
  } catch (error) {
    console.error("[PUT /api/tax-buffer/settings] Failed to save settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
