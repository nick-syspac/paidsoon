import { NextResponse } from "next/server"
import { z } from "zod"

import { buildCostGuardRuleChangeEventRecord, buildDefaultCostGuardRules } from "@/lib/costGuard/foundation"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

const RuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ruleType: z.string().trim().min(1),
  supplierId: z.string().trim().optional().nullable(),
  categoryId: z.string().trim().optional().nullable(),
  percentageThreshold: z.number().min(0).max(100).optional(),
  absoluteThresholdCents: z.number().int().min(0).optional(),
  severity: z.enum(["info", "watch", "warning", "critical"]).optional(),
  enabled: z.boolean().optional(),
})

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rules = await withUserContext(user.id, (tx) =>
    tx.costGuardRule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
  )

  if (rules.length === 0) {
    const defaults = buildDefaultCostGuardRules()
    const seeded = await withUserContext(user.id, async (tx) =>
      Promise.all(
        defaults.map((rule) =>
          tx.costGuardRule.create({
            data: {
              userId: user.id,
              name: rule.name,
              ruleType: rule.ruleType,
              percentageThreshold: rule.defaultPercentageThreshold,
              absoluteThresholdCents: rule.defaultAbsoluteThresholdCents,
              severity: rule.severity,
              enabled: rule.enabled,
            },
          }),
        ),
      ),
    )

    return NextResponse.json({ rules: seeded })
  }

  return NextResponse.json({ rules })
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = RuleSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const rule = await withUserContext(user.id, async (tx) => {
    const created = await tx.costGuardRule.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        ruleType: parsed.data.ruleType,
        supplierId: parsed.data.supplierId ?? null,
        categoryId: parsed.data.categoryId ?? null,
        percentageThreshold: parsed.data.percentageThreshold ?? 20,
        absoluteThresholdCents: parsed.data.absoluteThresholdCents ?? 10000,
        severity: parsed.data.severity ?? "warning",
        enabled: parsed.data.enabled ?? true,
      },
    })

    const eventRecord = buildCostGuardRuleChangeEventRecord({
      userId: user.id,
      ruleId: created.id,
      action: "create",
      actorId: user.id,
      reason: "Created cost guard rule",
      next: {
        name: created.name,
        ruleType: created.ruleType,
        supplierId: created.supplierId,
        categoryId: created.categoryId,
        percentageThreshold: created.percentageThreshold,
        absoluteThresholdCents: created.absoluteThresholdCents,
        severity: created.severity,
        enabled: created.enabled,
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

    return created
  })

  return NextResponse.json({ rule })
}
