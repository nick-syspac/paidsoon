import { NextResponse } from "next/server"
import { z } from "zod"

import { buildCostGuardRuleChangeEventRecord } from "@/lib/costGuard/foundation"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ id: string }> }

const RulePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  ruleType: z.string().trim().min(1).optional(),
  supplierId: z.string().trim().optional().nullable(),
  categoryId: z.string().trim().optional().nullable(),
  percentageThreshold: z.number().min(0).max(100).optional(),
  absoluteThresholdCents: z.number().int().min(0).optional(),
  severity: z.enum(["info", "watch", "warning", "critical"]).optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = RulePatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const updated = await withUserContext(user.id, async (tx) => {
    const existing = await tx.costGuardRule.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        userId: true,
        name: true,
        ruleType: true,
        supplierId: true,
        categoryId: true,
        percentageThreshold: true,
        absoluteThresholdCents: true,
        severity: true,
        enabled: true,
      },
    })

    if (!existing) {
      return { status: 404 as const }
    }

    const previous = {
      name: existing.name,
      ruleType: existing.ruleType,
      supplierId: existing.supplierId,
      categoryId: existing.categoryId,
      percentageThreshold: existing.percentageThreshold,
      absoluteThresholdCents: existing.absoluteThresholdCents,
      severity: existing.severity,
      enabled: existing.enabled,
    }

    const rule = await tx.costGuardRule.update({
      where: { id: existing.id },
      data: { ...parsed.data },
    })

    const eventRecord = buildCostGuardRuleChangeEventRecord({
      userId: user.id,
      ruleId: rule.id,
      action: "update",
      actorId: user.id,
      reason: "Updated cost guard rule",
      previous,
      next: {
        name: rule.name,
        ruleType: rule.ruleType,
        supplierId: rule.supplierId,
        categoryId: rule.categoryId,
        percentageThreshold: rule.percentageThreshold,
        absoluteThresholdCents: rule.absoluteThresholdCents,
        severity: rule.severity,
        enabled: rule.enabled,
      },
    })

    await tx.costGuardAlertEvent.create({
      data: {
        userId: eventRecord.userId,
        alertId: eventRecord.alertId,
        eventType: eventRecord.eventType,
        actorId: eventRecord.actorId ?? undefined,
        reason: eventRecord.reason ?? undefined,
        metadata: eventRecord.metadata,
      },
    })

    return { status: 200 as const, rule }
  })

  if (updated.status === 404) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ rule: updated.rule })
}
