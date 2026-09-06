import { NextResponse } from "next/server"
import { z } from "zod"

import {
  buildCashPlanForecast,
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

  const payload = await withUserContext(user.id, async (tx) => {
    const [plan, settings] = await Promise.all([
      tx.cashPlan.findFirst({
        where: parsed.data.planId
          ? { id: parsed.data.planId, userId: user.id }
          : { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          horizonWeeks: true,
          bufferTargetCents: true,
        },
      }),
      tx.cashPlanSetting.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          horizonWeeks: true,
          bufferTargetCents: true,
        },
      }),
    ])

    const latestSnapshot = plan
      ? await tx.cashPlanSnapshot.findFirst({
          where: { planId: plan.id },
          orderBy: { createdAt: "desc" },
          select: {
            weeks: true,
            bufferGapCents: true,
            lowestClosingCashCents: true,
          },
        })
      : null

    const bufferTargetCents = settings?.bufferTargetCents ?? plan?.bufferTargetCents ?? defaultCashPlanSettings.bufferTargetCents
    const horizonWeeks = settings?.horizonWeeks ?? plan?.horizonWeeks ?? defaultCashPlanSettings.horizonWeeks

    const weeks: CashPlanForecastWeek[] = Array.isArray(latestSnapshot?.weeks)
      ? (latestSnapshot.weeks as unknown as CashPlanForecastWeek[])
      : buildCashPlanForecast({
          openingCashCents: 0,
          inflows: [],
          outflows: [],
          bufferTargetCents,
          now: new Date(),
        }).weeks.slice(0, horizonWeeks)

    return {
      planId: plan?.id ?? null,
      title: plan?.name ?? "Base plan",
      horizonWeeks,
      weeks,
      summary: {
        lowestClosingCashCents: weeks.reduce((lowest, week) => Math.min(lowest, week.closingCashCents), Number.POSITIVE_INFINITY),
        bufferGapCents: Math.min(...weeks.map((week) => week.bufferGapCents)),
      },
    }
  })

  return NextResponse.json(payload)
}
