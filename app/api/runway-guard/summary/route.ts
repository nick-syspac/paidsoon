import { NextResponse } from "next/server"
import { z } from "zod"

import { buildRunwayGuardServiceOutput } from "@/lib/runwayGuard/service"
import { requireRunwayGuardCoreAccess } from "@/lib/runwayGuard/entitlements"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  openingCashCents: z.coerce.number().int().nonnegative().optional(),
  protectedCashCents: z.coerce.number().int().nonnegative().optional(),
  reserveBufferCents: z.coerce.number().int().nonnegative().optional(),
  committedOutflowsCents: z.coerce.number().int().nonnegative().optional(),
  horizonDays: z.coerce.number().int().positive().optional(),
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
    await requireRunwayGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    openingCashCents: searchParams.get("openingCashCents") ?? undefined,
    protectedCashCents: searchParams.get("protectedCashCents") ?? undefined,
    reserveBufferCents: searchParams.get("reserveBufferCents") ?? undefined,
    committedOutflowsCents: searchParams.get("committedOutflowsCents") ?? undefined,
    horizonDays: searchParams.get("horizonDays") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data
  const openingCashCents = input.openingCashCents ?? 0

  try {
    const output = buildRunwayGuardServiceOutput({
      openingCashCents,
      protectedCashCents: input.protectedCashCents ?? 0,
      reserveBufferCents: input.reserveBufferCents ?? 0,
      committedOutflowsCents: input.committedOutflowsCents ?? 0,
      policy: {
        horizonDays: input.horizonDays ?? 90,
        warningThresholdDays: 90,
        criticalThresholdDays: 45,
        lowConfidenceWeight: 0.6,
        minimumConfidence: 0.5,
      },
      forecast: [
        { day: 0, projectedCashCents: openingCashCents },
        { day: 30, projectedCashCents: Math.max(0, openingCashCents - 200000) },
        { day: 60, projectedCashCents: Math.max(0, openingCashCents - 400000) },
      ],
    })

    return NextResponse.json({ summary: output.summary, scenario: output.scenario, alert: output.alert, materialChange: output.materialChange })
  } catch (error) {
    console.error("[GET /api/runway-guard/summary] Failed to load runway summary", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
