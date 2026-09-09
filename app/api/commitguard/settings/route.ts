import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { getCommitGuardSettings, saveCommitGuardSettings } from "@/lib/commitguard/service"
import { createClient } from "@/lib/supabase/server"

const SettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultHorizonDays: z.number().int().refine((value) => value === 7 || value === 30 || value === 60 || value === 90).optional(),
    safetyBufferMode: z.enum(["fixed_amount", "percentage_monthly_commitments", "weeks_operating_expenses"]).optional(),
    safetyBufferFixedCents: z.number().int().min(0).optional(),
    safetyBufferPercent: z.number().min(0).max(100).optional().nullable(),
    safetyBufferWeeks: z.number().min(0).max(24).optional().nullable(),
    detectRecurringCommitments: z.boolean().optional(),
    detectionMinOccurrences: z.number().int().min(2).max(10).optional(),
    detectionAmountVariancePercent: z.number().min(1).max(100).optional(),
    detectionIntervalToleranceDays: z.number().int().min(1).max(30).optional(),
    detectionConfidenceThreshold: z.enum(["confirmed", "high", "medium", "low"]).optional(),
    alertCommitmentDueSoon: z.boolean().optional(),
    alertRenewalApproaching: z.boolean().optional(),
    alertNoticePeriodApproaching: z.boolean().optional(),
    alertCommitmentAmountChanged: z.boolean().optional(),
    alertCommitmentBufferLow: z.boolean().optional(),
    alertCommitmentShortfall: z.boolean().optional(),
    renewalWarningDays: z.array(z.number().int().min(1).max(365)).max(12).optional(),
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

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const settings = await getCommitGuardSettings(user.id)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[GET /api/commitguard/settings] Failed to load settings", error)
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

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = SettingsSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const settings = await saveCommitGuardSettings(user.id, parsed.data)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[PUT /api/commitguard/settings] Failed to save settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
