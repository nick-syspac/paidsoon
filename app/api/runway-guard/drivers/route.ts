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
  const openingCashCents = input.openingCashCents ?? 1000000
  const output = buildRunwayGuardServiceOutput({
    openingCashCents,
    protectedCashCents: input.protectedCashCents ?? 200000,
    reserveBufferCents: input.reserveBufferCents ?? 50000,
    committedOutflowsCents: input.committedOutflowsCents ?? 100000,
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
      { day: 90, projectedCashCents: Math.max(0, openingCashCents - 600000) },
    ],
  })

  const drivers = [
    {
      label: "Protected cash reserve",
      impactCents: -(input.protectedCashCents ?? 200000),
      direction: "negative",
      confidence: "high",
      note: "Cash protected for tax and reserve purposes is excluded from usable runway calculations.",
    },
    {
      label: "Committed net outflows",
      impactCents: -(input.committedOutflowsCents ?? 100000),
      direction: "negative",
      confidence: "medium",
      note: "Committed costs reduce near-term runway and are treated as protected liquidity.",
    },
    {
      label: "Forecast trajectory",
      impactCents: output.summary.runwayDays,
      direction: "positive",
      confidence: "medium",
      note: "The current forecast path remains the primary indicator for runway sustainability.",
    },
  ]

  const recommendations = [
    {
      kind: "cash",
      title: "Protect cash buffer",
      message: "Maintain a reserve above the current low-confidence forecast floor to reduce runway volatility.",
      impact: "medium",
      estimatedDaysImprovement: 15,
    },
    {
      kind: "operations",
      title: "Tighten fixed commitments",
      message: "Review the next 90 days of fixed costs to slow the projected cash-out date.",
      impact: "medium",
      estimatedDaysImprovement: 10,
    },
  ]

  return NextResponse.json({
    summary: output.summary,
    drivers,
    recommendations,
  })
}
