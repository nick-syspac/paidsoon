import { NextResponse } from "next/server"

import { buildCostGuardAlertSummary } from "@/lib/costGuard/foundation"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
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

  const alert: AlertRow | null = await withUserContext(user.id, (tx) =>
    tx.costGuardAlert.findFirst({
      where: { id, userId: user.id },
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

  if (!alert) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const events: Array<{
    id: string
    alertId: string
    eventType: string
    actorId: string | null
    reason: string | null
    metadata: unknown
    createdAt: Date
  }> = await withUserContext(user.id, (tx) =>
    tx.costGuardAlertEvent.findMany({
      where: { alertId: alert.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        alertId: true,
        eventType: true,
        actorId: true,
        reason: true,
        metadata: true,
        createdAt: true,
      },
    }),
  )

  return NextResponse.json({
    alert: buildCostGuardAlertSummary({
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
    events: events.map((event) => ({
      id: event.id,
      alertId: event.alertId,
      eventType: event.eventType,
      actorId: event.actorId,
      reason: event.reason,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    })),
  })
}
