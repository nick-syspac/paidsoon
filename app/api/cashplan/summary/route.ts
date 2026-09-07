import { NextResponse } from "next/server"
import { z } from "zod"

import {
  buildCashPlanForecast,
  buildCashPlanSummaryResponse,
  defaultCashPlanSettings,
  type CashPlanForecastWeek,
} from "@/lib/cashplan/engine"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  planId: z.string().trim().min(1).optional(),
})

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    planId: searchParams.get("planId") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const summary = await withUserContext(user.id, async (tx) => {
    const [plan, settings] = await Promise.all([
      tx.cashPlan.findFirst({
        where: parsed.data.planId
          ? { id: parsed.data.planId, userId: user.id }
          : { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          currency: true,
          timezone: true,
          horizonWeeks: true,
          bufferTargetCents: true,
          status: true,
          updatedAt: true,
        },
      }),
      tx.cashPlanSetting.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          currency: true,
          timezone: true,
          horizonWeeks: true,
          bufferTargetCents: true,
          alertThresholdCents: true,
          reviewRole: true,
        },
      }),
    ])

    const latestSnapshot = plan
      ? await tx.cashPlanSnapshot.findFirst({
          where: { planId: plan.id },
          orderBy: { createdAt: "desc" },
          select: {
            inputHash: true,
            engineVersion: true,
            confidence: true,
            status: true,
            lowestClosingCashCents: true,
            bufferGapCents: true,
            weeks: true,
          },
        })
      : null

    const bufferTargetCents = settings?.bufferTargetCents ?? plan?.bufferTargetCents ?? defaultCashPlanSettings.bufferTargetCents

    if (latestSnapshot && Array.isArray(latestSnapshot.weeks)) {
      const weeks = latestSnapshot.weeks as unknown as CashPlanForecastWeek[]
      const forecast = {
        engineVersion: latestSnapshot.engineVersion,
        inputHash: latestSnapshot.inputHash,
        confidence: latestSnapshot.confidence,
        status: (latestSnapshot.status === "healthy" || latestSnapshot.status === "preliminary" || latestSnapshot.status === "stale"
          ? latestSnapshot.status
          : "preliminary") as "healthy" | "preliminary" | "stale",
        lowestClosingCashCents: latestSnapshot.lowestClosingCashCents,
        bufferGapCents: latestSnapshot.bufferGapCents,
        dataQualityIssues: [],
        inflows: [],
        outflows: [],
        weeks,
      }

      return buildCashPlanSummaryResponse({
        forecast,
        title: plan?.name ?? "Base plan",
      })
    }

    const forecast = buildCashPlanForecast({
      openingCashCents: 0,
      inflows: [],
      outflows: [],
      bufferTargetCents,
      now: new Date(),
    })

    return buildCashPlanSummaryResponse({
      forecast,
      title: plan?.name ?? "Base plan",
    })
  })

  return NextResponse.json(summary)
}
