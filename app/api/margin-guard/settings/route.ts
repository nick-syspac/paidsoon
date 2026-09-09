import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardCoreAccess } from "@/lib/marginguard/entitlements"
import { getOrCreateMarginSettings, updateMarginSettings } from "@/lib/marginguard/service"
import { validateMarginThresholds } from "@/lib/marginguard/engine"
import { createClient } from "@/lib/supabase/server"

const SettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultPeriod: z.enum(["30d", "3m", "6m", "12m", "fy"]).optional(),
    targetGrossMarginPercent: z.number().min(0).max(99.99).optional(),
    warningGrossMarginPercent: z.number().min(0).max(99.99).optional(),
    criticalGrossMarginPercent: z.number().min(0).max(99.99).optional(),
    minCompletenessPercent: z.number().min(0).max(100).optional(),
    alertBelowWarning: z.boolean().optional(),
    alertBelowCritical: z.boolean().optional(),
    alertDeterioration: z.boolean().optional(),
    alertNegativeMargin: z.boolean().optional(),
    alertCustomerMarginWarning: z.boolean().optional(),
    alertCostIncrease: z.boolean().optional(),
    alertDataQualityWarning: z.boolean().optional(),
    alertDigestMode: z.enum(["daily", "weekly", "monthly"]).optional(),
  })
  .strict()

export async function GET(): Promise<NextResponse> {
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

  try {
    const settings = await getOrCreateMarginSettings(user.id)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[GET /api/margin-guard/settings] Failed to load settings", error)
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

  try {
    await requireMarginGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = SettingsSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const current = await getOrCreateMarginSettings(user.id)
    const merged = {
      targetPercent: parsed.data.targetGrossMarginPercent ?? current.targetGrossMarginPercent,
      warningPercent: parsed.data.warningGrossMarginPercent ?? current.warningGrossMarginPercent,
      criticalPercent: parsed.data.criticalGrossMarginPercent ?? current.criticalGrossMarginPercent,
    }
    validateMarginThresholds(merged)

    const settings = await updateMarginSettings(user.id, parsed.data)
    return NextResponse.json({ settings })
  } catch (error) {
    if (error instanceof Error && error.message.includes("critical < warning < target")) {
      return NextResponse.json({ error: "Thresholds must satisfy critical < warning < target" }, { status: 400 })
    }
    console.error("[PUT /api/margin-guard/settings] Failed to save settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
