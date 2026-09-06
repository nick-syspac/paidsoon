import { NextResponse } from "next/server"

import { buildCostGuardAlertSummary } from "@/lib/costGuard/foundation"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary: {
    forecast: {
      id: string
      forecastMonth: string
      actualSpendCents: number
      recurringCommitmentsCents: number
      expectedVariableSpendCents: number
      projectedMonthEndCents: number
      varianceAmountCents: number
      variancePercent: number
      confidence: number
      assumptions: unknown
      createdAt: string
    } | null
    alertCount: number
    alerts: ReturnType<typeof buildCostGuardAlertSummary>[]
  } = await withUserContext(user.id, async (tx) => {
    const [latestForecast, alerts] = await Promise.all([
      tx.costGuardForecast.findFirst({
        where: { userId: user.id },
        orderBy: { forecastMonth: "desc" },
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
      tx.costGuardAlert.findMany({
        where: { userId: user.id },
        orderBy: { detectedAt: "desc" },
        take: 10,
        select: {
          id: true,
          userId: true,
          alertType: true,
          severity: true,
          title: true,
          description: true,
          baselineAmountCents: true,
          actualAmountCents: true,
          varianceAmountCents: true,
          variancePercent: true,
          confidence: true,
          status: true,
          detectedAt: true,
          supplierId: true,
          categoryId: true,
          transactionId: true,
        },
      }),
    ])

    return {
      forecast: latestForecast
        ? {
            id: latestForecast.id,
            forecastMonth: latestForecast.forecastMonth.toISOString(),
            actualSpendCents: latestForecast.actualSpendCents,
            recurringCommitmentsCents: latestForecast.recurringCommitmentsCents,
            expectedVariableSpendCents: latestForecast.expectedVariableSpendCents,
            projectedMonthEndCents: latestForecast.projectedMonthEndCents,
            varianceAmountCents: latestForecast.varianceAmountCents,
            variancePercent: latestForecast.variancePercent,
            confidence: latestForecast.confidence,
            assumptions: latestForecast.assumptions,
            createdAt: latestForecast.createdAt.toISOString(),
          }
        : null,
      alertCount: alerts.length,
      alerts: alerts.map((alert) =>
        buildCostGuardAlertSummary({
          id: alert.id,
          userId: alert.userId,
          alertType: alert.alertType,
          severity: alert.severity as "info" | "watch" | "warning" | "critical",
          title: alert.title,
          description: alert.description,
          baselineAmountCents: alert.baselineAmountCents,
          actualAmountCents: alert.actualAmountCents,
          varianceAmountCents: alert.varianceAmountCents,
          variancePercent: alert.variancePercent,
          confidence: alert.confidence,
          status: alert.status,
          detectedAt: alert.detectedAt,
          supplierId: alert.supplierId,
          categoryId: alert.categoryId,
          transactionId: alert.transactionId,
        }),
      ),
    }
  })

  return NextResponse.json(summary)
}
