import { NextResponse } from "next/server"
import { z } from "zod"

import { buildCashPlanForecast, buildCashPlanSummaryResponse, defaultCashPlanSettings } from "@/lib/cashplan/engine"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  planId: z.string().trim().min(1).optional(),
  format: z.enum(["json"]).default("json"),
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
    format: searchParams.get("format") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const payload = await withUserContext(user.id, async (tx) => {
    const plan = await tx.cashPlan.findFirst({
      where: parsed.data.planId
        ? { id: parsed.data.planId, userId: user.id }
        : { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        bufferTargetCents: true,
      },
    })

    const settings = await tx.cashPlanSetting.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        bufferTargetCents: true,
      },
    })

    const forecast = buildCashPlanForecast({
      openingCashCents: 0,
      inflows: [],
      outflows: [],
      bufferTargetCents: settings?.bufferTargetCents ?? plan?.bufferTargetCents ?? defaultCashPlanSettings.bufferTargetCents,
      now: new Date(),
    })

    return {
      format: parsed.data.format,
      generatedAt: new Date().toISOString(),
      ...buildCashPlanSummaryResponse({
        forecast,
        title: plan?.name ?? "Base plan",
      }),
    }
  })

  return NextResponse.json(payload)
}
