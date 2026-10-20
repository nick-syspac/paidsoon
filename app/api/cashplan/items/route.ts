import { NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { loadCashPlanInputsInTransaction } from "@/lib/cashplan/inputLoader"
import { getCashPlanWeekIndex } from "@/lib/cashplan/calendar"
import { CashPlanQuerySchema, loadCashPlan, presentCashPlan } from "@/lib/cashplan/service"
import { cashPlanRouteError } from "@/lib/cashplan/routeError"

import {
  buildCashPlanManualOverride,
  buildCashPlanPlannedItem,
  buildCashPlanSourceLineage,
} from "@/lib/cashplan/engine"
import { withUserContext } from "@/lib/db/withUserContext"
import { createClient } from "@/lib/supabase/server"

const PlannedItemSchema = z.object({
  planId: z.string().trim().min(1).optional(),
  kind: z.enum(["inflow", "outflow"]),
  amountCents: z.number().int().positive().max(2_147_483_647),
  plannedDate: z.iso.date(),
  // Accepted for old clients, but never used to infer persisted timing.
  weekIndex: z.number().int().min(0).max(12).optional(),
  reason: z.string().trim().min(1).max(500),
  owner: z.string().trim().min(1).nullable().optional(),
  effectiveFrom: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  sourceId: z.string().trim().min(1).optional(),
  sourceType: z.literal("manual").default("manual"),
}).superRefine((value, ctx) => {
  if (value.sourceId && /^(commitguard|imported_bill|manual):/.test(value.sourceId)) {
    ctx.addIssue({ code: "custom", path: ["sourceId"], message: "Use a standalone manual item identity" })
  }
  if (value.effectiveFrom && value.expiresAt && value.effectiveFrom >= value.expiresAt) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must follow effective date" })
  }
})

import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
export const GET = withSubscriptionAccess(GETHandler)
export const POST = withSubscriptionAccess(POSTHandler)
async function GETHandler(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = CashPlanQuerySchema.safeParse(Object.fromEntries(searchParams))

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const assembly = await loadCashPlan(user.id, parsed.data)
    return NextResponse.json({ planId: assembly.inputs.plan?.id ?? null,
      title: assembly.inputs.plan?.name ?? "Base plan", version: 2,
      inflows: assembly.bundle.inflows, outflows: assembly.bundle.outflows,
      facts: assembly.facts, coverage: assembly.coverage, plannedItems: assembly.plannedItems,
      summary: presentCashPlan(assembly),
      count: { inflows: assembly.bundle.inflows.length, outflows: assembly.bundle.outflows.length } })
  } catch (error) { return cashPlanRouteError(error) }
}

async function POSTHandler(request: Request): Promise<NextResponse> {
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
    const inputs = await loadCashPlanInputsInTransaction(tx, user.id, { planId: parsed.data.planId, now: new Date() })
    const plan = inputs.plan

    if (!plan) {
      return { error: "Not found", status: 404 as const }
    }
    const weekIndex = inputs.anchor && inputs.configuration?.horizonWeeks === 13
      ? getCashPlanWeekIndex(parsed.data.plannedDate, inputs.anchor) : null
    if (weekIndex === null) return { error: "Planned date must be inside the selected plan's 13-week window", status: 400 as const }

    const effectiveFrom = parsed.data.effectiveFrom ? new Date(parsed.data.effectiveFrom) : null
    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null
    const plannedDate = new Date(`${parsed.data.plannedDate}T00:00:00Z`)
    const sourceId = parsed.data.sourceId ?? `planned-${randomUUID()}`
    const sourceLineage = buildCashPlanSourceLineage({
      sourceSystem: parsed.data.sourceType,
      sourceId,
      sourceUpdatedAt: effectiveFrom ?? null,
      sourceHash: `${plan.id}:${parsed.data.kind}:${parsed.data.amountCents}:${parsed.data.plannedDate}:${parsed.data.reason}`,
    })

    const plannedItem = buildCashPlanPlannedItem({
      id: sourceId,
      kind: parsed.data.kind,
      amountCents: parsed.data.amountCents,
      weekIndex,
      plannedDate,
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
        plannedDate,
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
        plannedDate: parsed.data.plannedDate,
      },
    }
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Not found") return { error: "Not found", status: 404 as const }
    throw error
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
}
