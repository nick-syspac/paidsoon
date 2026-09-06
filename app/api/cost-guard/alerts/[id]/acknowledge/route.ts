import { NextResponse } from "next/server"
import { z } from "zod"

import {
  buildCostGuardAlertEventRecord,
  buildCostGuardAlertSummary,
  canTransitionCostGuardAlertStatus,
  COST_GUARD_ALERT_EVENT_TYPES,
} from "@/lib/costGuard/foundation"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ id: string }> }

const ActionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const { id } = await params
  const nextStatus = "acknowledged"

  const result = await withUserContext(user.id, async (tx) => {
    const existing = await tx.costGuardAlert.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        status: true,
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
        detectedAt: true,
        supplierId: true,
        categoryId: true,
        transactionId: true,
      },
    })

    if (!existing) {
      return { status: 404 as const }
    }

    if (!canTransitionCostGuardAlertStatus(existing.status, nextStatus)) {
      return { status: 422 as const }
    }

    const updated = await tx.costGuardAlert.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        acknowledgedAt: new Date(),
      },
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
    })

    const eventRecord = buildCostGuardAlertEventRecord({
      userId: user.id,
      alertId: updated.id,
      status: nextStatus,
      actorId: user.id,
      reason: parsed.data.reason ?? "Reviewed alert",
    })

    await tx.costGuardAlertEvent.create({
      data: {
        userId: eventRecord.userId,
        alertId: eventRecord.alertId,
        eventType: eventRecord.eventType,
        actorId: eventRecord.actorId ?? undefined,
        reason: eventRecord.reason ?? undefined,
        metadata: eventRecord.metadata ?? undefined,
      },
    })

    return { status: 200 as const, alert: buildCostGuardAlertSummary({
      id: updated.id,
      userId: updated.userId,
      alertType: updated.alertType,
      severity: updated.severity as "info" | "watch" | "warning" | "critical",
      title: updated.title,
      description: updated.description,
      baselineAmountCents: updated.baselineAmountCents,
      actualAmountCents: updated.actualAmountCents,
      varianceAmountCents: updated.varianceAmountCents,
      variancePercent: updated.variancePercent,
      confidence: updated.confidence,
      status: updated.status,
      detectedAt: updated.detectedAt,
      supplierId: updated.supplierId,
      categoryId: updated.categoryId,
      transactionId: updated.transactionId,
    }) }
  })

  if (result.status === 404) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (result.status === 422) {
    return NextResponse.json({ error: "Invalid state transition" }, { status: 422 })
  }

  return NextResponse.json({ alert: result.alert })
}
