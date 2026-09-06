import { NextResponse } from "next/server"
import { z } from "zod"

import {
  buildCostGuardForecastSummary,
  buildRecurringSpendBaselineFromSpendInsights,
  calculateForecast,
} from "@/lib/costGuard/foundation"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  month: z.string().datetime().optional(),
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
    month: searchParams.get("month") ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const forecast = await withUserContext(user.id, async (tx) => {
    const month = parsed.data.month ? new Date(parsed.data.month) : new Date()
    const row = await tx.costGuardForecast.findFirst({
      where: {
        userId: user.id,
        forecastMonth: {
          gte: new Date(month.getFullYear(), month.getMonth(), 1),
          lt: new Date(month.getFullYear(), month.getMonth() + 1, 1),
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        forecastMonth: true,
        actualSpendCents: true,
        recurringCommitmentsCents: true,
        expectedVariableSpendCents: true,
        projectedMonthEndCents: true,
        varianceAmountCents: true,
        variancePercent: true,
        confidence: true,
        assumptions: true,
        createdAt: true,
      },
    })

    const recurringInsights = await tx.spendInsight.findMany({
      where: {
        userId: user.id,
        findingType: "recurring_spend",
        state: { in: ["open", "snoozed"] },
      },
      select: {
        findingType: true,
        state: true,
        estimatedMonthlyCents: true,
        estimatedAnnualCents: true,
      },
    })

    const recurringBaseline = buildRecurringSpendBaselineFromSpendInsights(recurringInsights)
    const effectiveRecurringCommitmentsCents = row
      ? Math.max(row.recurringCommitmentsCents, recurringBaseline.currentMonthlyCents)
      : recurringBaseline.currentMonthlyCents

    if (!row && effectiveRecurringCommitmentsCents === 0) {
      return null
    }

    const effectiveForecast = row
      ? {
          ...row,
          recurringCommitmentsCents: effectiveRecurringCommitmentsCents,
        }
      : {
          id: "derived-recurring-baseline",
          userId: user.id,
          forecastMonth: new Date(month.getFullYear(), month.getMonth(), 1),
          actualSpendCents: 0,
          recurringCommitmentsCents: effectiveRecurringCommitmentsCents,
          expectedVariableSpendCents: 0,
          projectedMonthEndCents: effectiveRecurringCommitmentsCents,
          varianceAmountCents: 0,
          variancePercent: 0,
          confidence: 75,
          assumptions: {
            source: "spend_insights.recurring_spend",
            recurringFindingCount: recurringBaseline.recurringFindingCount,
          },
          createdAt: new Date(),
        }

    return {
      ...effectiveForecast,
      forecastMonth: effectiveForecast.forecastMonth.toISOString(),
      createdAt: effectiveForecast.createdAt.toISOString(),
      summary: buildCostGuardForecastSummary({
        actualSpendCents: effectiveForecast.actualSpendCents,
        recurringCommitmentsCents: effectiveForecast.recurringCommitmentsCents,
        expectedVariableSpendCents: effectiveForecast.expectedVariableSpendCents,
        projectedMonthEndCents: effectiveForecast.projectedMonthEndCents,
        varianceAmountCents: effectiveForecast.varianceAmountCents,
        variancePercent: effectiveForecast.variancePercent,
        confidence: effectiveForecast.confidence,
      }),
    }
  })

  if (!forecast) {
    return NextResponse.json({
      forecast: null,
      summary: null,
    })
  }

  return NextResponse.json({
    forecast,
    summary: forecast.summary,
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const schema = z.object({
    forecastMonth: z.string().datetime(),
    actualSpendCents: z.number().int().nonnegative(),
    recurringCommitmentsCents: z.number().int().nonnegative(),
    expectedVariableSpendCents: z.number().int().nonnegative(),
    baselineSpendCents: z.number().int().nonnegative().optional(),
    assumptions: z.record(z.unknown()).optional(),
  })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const forecast = calculateForecast({
    actualSpendCents: parsed.data.actualSpendCents,
    recurringCommitmentsCents: parsed.data.recurringCommitmentsCents,
    expectedVariableSpendCents: parsed.data.expectedVariableSpendCents,
    baselineSpendCents: parsed.data.baselineSpendCents,
  })

  const stored = await withUserContext(user.id, async (tx) =>
    tx.costGuardForecast.create({
      data: {
        userId: user.id,
        forecastMonth: new Date(parsed.data.forecastMonth),
        actualSpendCents: forecast.actualSpendCents,
        recurringCommitmentsCents: forecast.recurringCommitmentsCents,
        expectedVariableSpendCents: forecast.expectedVariableSpendCents,
        projectedMonthEndCents: forecast.projectedMonthEndCents,
        varianceAmountCents: forecast.varianceAmountCents,
        variancePercent: forecast.variancePercent,
        confidence: forecast.confidence,
        assumptions: parsed.data.assumptions ?? null,
      },
      select: {
        id: true,
        userId: true,
        forecastMonth: true,
        actualSpendCents: true,
        recurringCommitmentsCents: true,
        expectedVariableSpendCents: true,
        projectedMonthEndCents: true,
        varianceAmountCents: true,
        variancePercent: true,
        confidence: true,
        assumptions: true,
        createdAt: true,
      },
    }),
  )

  return NextResponse.json({
    forecast: {
      ...stored,
      forecastMonth: stored.forecastMonth.toISOString(),
      createdAt: stored.createdAt.toISOString(),
      summary: buildCostGuardForecastSummary(forecast),
    },
  })
}
