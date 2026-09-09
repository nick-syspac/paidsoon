import { NextResponse } from "next/server"
import { z } from "zod"

import { buildRunwayGuardServiceOutput } from "@/lib/runwayGuard/service"
import { requireRunwayGuardScenarioAccess } from "@/lib/runwayGuard/entitlements"
import { createClient } from "@/lib/supabase/server"

const ScenarioSchema = z
  .object({
    openingCashCents: z.number().int().nonnegative(),
    protectedCashCents: z.number().int().nonnegative().optional().default(0),
    reserveBufferCents: z.number().int().nonnegative().optional().default(0),
    committedOutflowsCents: z.number().int().nonnegative().optional().default(0),
    scenarioType: z.enum(["base", "conservative", "stress", "custom"]).optional().default("custom"),
    inflowMultiplier: z.number().gt(0).max(2).optional().default(1),
    outflowMultiplier: z.number().gt(0).max(2).optional().default(1),
    horizonDays: z.number().int().positive().max(3650).optional(),
  })
  .strict()

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireRunwayGuardScenarioAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = ScenarioSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const output = buildRunwayGuardServiceOutput({
      openingCashCents: parsed.data.openingCashCents,
      protectedCashCents: parsed.data.protectedCashCents,
      reserveBufferCents: parsed.data.reserveBufferCents,
      committedOutflowsCents: parsed.data.committedOutflowsCents,
      policy: {
        horizonDays: parsed.data.horizonDays ?? 90,
        warningThresholdDays: 90,
        criticalThresholdDays: 45,
        lowConfidenceWeight: 0.6,
        minimumConfidence: 0.5,
      },
      forecast: [
        { day: 0, projectedCashCents: parsed.data.openingCashCents },
        { day: 30, projectedCashCents: Math.max(0, parsed.data.openingCashCents - 200000) },
        { day: 60, projectedCashCents: Math.max(0, parsed.data.openingCashCents - 400000) },
      ],
      scenario: {
        inflowMultiplier: parsed.data.inflowMultiplier,
        outflowMultiplier: parsed.data.outflowMultiplier,
      },
    })

    return NextResponse.json({
      summary: output.summary,
      scenario: output.scenario,
      alert: output.alert,
      materialChange: output.materialChange,
    })
  } catch (error) {
    console.error("[POST /api/runway-guard/scenarios] Failed to simulate runway scenario", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
