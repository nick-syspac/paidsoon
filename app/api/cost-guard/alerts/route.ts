import { NextResponse } from "next/server"
import { z } from "zod"

import { buildCostGuardAlertSummary, normalizeCostGuardAlertStatus } from "@/lib/costGuard/foundation"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  status: z
    .enum(["new", "acknowledged", "expected", "snoozed", "investigating", "resolved", "ignored"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
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
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? 25,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  type AlertRow = {
    id: string
    userId: string
    alertType: string
    severity: string
    title: string
    description: string
    baselineAmountCents: number
    actualAmountCents: number
    varianceAmountCents: number
    variancePercent: number
    confidence: number
    status: string
    detectedAt: Date
    supplierId: string | null
    categoryId: string | null
    transactionId: string | null
  }

  const alerts: AlertRow[] = await withUserContext(user.id, (tx) =>
    tx.costGuardAlert.findMany({
      where: {
        userId: user.id,
        ...(parsed.data.status ? { status: normalizeCostGuardAlertStatus(parsed.data.status) } : {}),
      },
      orderBy: { detectedAt: "desc" },
      take: parsed.data.limit,
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
  )

  return NextResponse.json({
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
  })
}
