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
  const horizonDays = input.horizonDays ?? 90
  const forecast = Array.from({ length: 4 }, (_, index) => {
    const day = index * 30
    return { day, projectedCashCents: Math.max(0, openingCashCents - day * 12000) }
  })

  try {
    const output = buildRunwayGuardServiceOutput({
      openingCashCents,
      protectedCashCents: input.protectedCashCents ?? 0,
      reserveBufferCents: input.reserveBufferCents ?? 0,
      committedOutflowsCents: input.committedOutflowsCents ?? 0,
      policy: {
        horizonDays,
        warningThresholdDays: 90,
        criticalThresholdDays: 45,
        lowConfidenceWeight: 0.6,
        minimumConfidence: 0.5,
      },
      forecast,
    })

    return NextResponse.json({
      horizonDays,
      timeline: forecast.map((point) => ({
        day: point.day,
        projectedCashCents: point.projectedCashCents,
        runwayDays: output.summary.runwayDays,
        status: output.summary.status,
      })),
      summary: output.summary,
    })
  } catch (error) {
    console.error("[GET /api/runway-guard/timeline] Failed to load runway timeline", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
