import { NextResponse } from "next/server"
import { z } from "zod"

import {
  buildCashPlanForecast,
  buildCashPlanManualOverride,
  buildCashPlanPlannedItem,
  buildCashPlanSourceLineage,
  defaultCashPlanSettings,
} from "@/lib/cashplan/engine"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

const QuerySchema = z.object({
  planId: z.string().trim().min(1).optional(),
})

const PlannedItemSchema = z.object({
  planId: z.string().trim().min(1).optional(),
  kind: z.enum(["inflow", "outflow"]),
  amountCents: z.number().int().positive(),
  weekIndex: z.number().int().min(0).max(52),
  reason: z.string().trim().min(1).max(500),
  owner: z.string().trim().min(1).nullable().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  sourceId: z.string().trim().min(1).optional(),
  sourceType: z.string().trim().min(1).default("manual"),
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
    const plan = await tx.cashPlan.findFirst({
      where: parsed.data.planId
        ? { id: parsed.data.planId, userId: user.id }
        : { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        bufferTargetCents: true,
        horizonWeeks: true,
      },
    })

    const settings = await tx.cashPlanSetting.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        bufferTargetCents: true,
        horizonWeeks: true,
      },
    })

    const bufferTargetCents = settings?.bufferTargetCents ?? plan?.bufferTargetCents ?? defaultCashPlanSettings.bufferTargetCents
    const forecast = buildCashPlanForecast({
      openingCashCents: 0,
      inflows: [],
      outflows: [],
      bufferTargetCents,
      now: new Date(),
    })

    return {
      planId: plan?.id ?? null,
      title: plan?.name ?? "Base plan",
      inflows: forecast.inflows,
      outflows: forecast.outflows,
      count: {
        inflows: forecast.inflows.length,
        outflows: forecast.outflows.length,
      },
    }
  })

  return NextResponse.json(payload)
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = PlannedItemSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const result = await withUserContext(user.id, async (tx) => {
    const plan = await tx.cashPlan.findFirst({
      where: parsed.data.planId
        ? { id: parsed.data.planId, userId: user.id }
        : { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
      },
    })

    if (!plan) {
      return { error: "Not found", status: 404 as const }
    }

    const effectiveFrom = parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : null
    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
    const sourceId = parsed.data.sourceId ?? `manual-${plan.id}-${parsed.data.kind}-${parsed.data.weekIndex}`
    const sourceLineage = buildCashPlanSourceLineage({
      sourceSystem: parsed.data.sourceType,
      sourceId,
      sourceUpdatedAt: effectiveFrom ?? null,
      sourceHash: `${plan.id}:${parsed.data.kind}:${parsed.data.amountCents}:${parsed.data.weekIndex}:${parsed.data.reason}`,
    })

    const plannedItem = buildCashPlanPlannedItem({
      id: sourceId,
      kind: parsed.data.kind,
      amountCents: parsed.data.amountCents,
      weekIndex: parsed.data.weekIndex,
      reason: parsed.data.reason,
      owner: parsed.data.owner ?? null,
      createdBy: user.id,
      effectiveFrom,
      expiresAt,
      sourceType: parsed.data.sourceType,
      sourceId,
      sourceLineage,
    })

    const override = buildCashPlanManualOverride({
      id: `override-${sourceId}`,
      entityType: parsed.data.kind,
      entityId: sourceId,
      amountCents: parsed.data.amountCents,
      reason: parsed.data.reason,
      owner: parsed.data.owner ?? null,
      createdBy: user.id,
      effectiveFrom,
      expiresAt,
      sourceType: parsed.data.sourceType,
      sourceId,
      sourceLineage,
    })

    const savedOverride = await tx.cashPlanOverride.create({
      data: {
        planId: plan.id,
        entityType: parsed.data.kind,
        entityId: sourceId,
        amountCents: parsed.data.amountCents,
        reason: parsed.data.reason,
        owner: parsed.data.owner ?? null,
        effectiveFrom,
        expiresAt,
        sourceType: parsed.data.sourceType,
        sourceId,
        createdBy: user.id,
      },
    })

    return {
      status: 200 as const,
      planId: plan.id,
      plannedItem,
      override: {
        ...override,
        id: savedOverride.id,
      },
    }
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
}
