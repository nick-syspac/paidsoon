import { NextResponse } from "next/server"
import { z } from "zod"

import { withUserContext } from "@/lib/db/withUserContext"
import { requireRunwayGuardCoreAccess } from "@/lib/runwayGuard/entitlements"
import { defaultRunwayGuardPolicy } from "@/lib/runwayGuard/foundation"
import { createClient } from "@/lib/supabase/server"

const SettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    horizonDays: z.number().int().min(7).max(3650).optional(),
    warningThresholdDays: z.number().int().min(1).max(3650).optional(),
    criticalThresholdDays: z.number().int().min(1).max(3650).optional(),
    lowConfidenceWeight: z.number().min(0).max(1).optional(),
    minimumConfidence: z.number().min(0).max(1).optional(),
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
    await requireRunwayGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  try {
    const stored = await withUserContext(user.id, async (tx) =>
      tx.runwayGuardSetting.findUnique({
        where: { userId: user.id },
      }),
    )

    const settings = {
      enabled: stored?.enabled ?? true,
      horizonDays: stored?.horizonDays ?? defaultRunwayGuardPolicy.horizonDays,
      warningThresholdDays: stored?.warningThresholdDays ?? defaultRunwayGuardPolicy.warningThresholdDays,
      criticalThresholdDays: stored?.criticalThresholdDays ?? defaultRunwayGuardPolicy.criticalThresholdDays,
      lowConfidenceWeight: stored?.lowConfidenceWeight ?? defaultRunwayGuardPolicy.lowConfidenceWeight,
      minimumConfidence: stored?.minimumConfidence ?? defaultRunwayGuardPolicy.minimumConfidence,
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error("[GET /api/runway-guard/settings] Failed to load runway settings", error)
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
    await requireRunwayGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = SettingsSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const current = {
    enabled: true,
    horizonDays: defaultRunwayGuardPolicy.horizonDays,
    warningThresholdDays: defaultRunwayGuardPolicy.warningThresholdDays,
    criticalThresholdDays: defaultRunwayGuardPolicy.criticalThresholdDays,
    lowConfidenceWeight: defaultRunwayGuardPolicy.lowConfidenceWeight,
    minimumConfidence: defaultRunwayGuardPolicy.minimumConfidence,
  }

  const settings = {
    ...current,
    ...parsed.data,
  }

  if (settings.criticalThresholdDays >= settings.warningThresholdDays) {
    return NextResponse.json({ error: "Thresholds must satisfy critical < warning" }, { status: 400 })
  }

  try {
    const stored = await withUserContext(user.id, async (tx) =>
      tx.runwayGuardSetting.upsert({
        where: { userId: user.id },
        update: {
          enabled: settings.enabled,
          horizonDays: settings.horizonDays,
          warningThresholdDays: settings.warningThresholdDays,
          criticalThresholdDays: settings.criticalThresholdDays,
          lowConfidenceWeight: settings.lowConfidenceWeight,
          minimumConfidence: settings.minimumConfidence,
        },
        create: {
          userId: user.id,
          enabled: settings.enabled,
          horizonDays: settings.horizonDays,
          warningThresholdDays: settings.warningThresholdDays,
          criticalThresholdDays: settings.criticalThresholdDays,
          lowConfidenceWeight: settings.lowConfidenceWeight,
          minimumConfidence: settings.minimumConfidence,
        },
      }),
    )

    return NextResponse.json({
      settings: {
        enabled: stored.enabled,
        horizonDays: stored.horizonDays,
        warningThresholdDays: stored.warningThresholdDays,
        criticalThresholdDays: stored.criticalThresholdDays,
        lowConfidenceWeight: stored.lowConfidenceWeight,
        minimumConfidence: stored.minimumConfidence,
      },
    })
  } catch (error) {
    console.error("[PUT /api/runway-guard/settings] Failed to save runway settings", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
