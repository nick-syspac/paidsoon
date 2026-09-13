import { NextResponse } from "next/server"
import { z } from "zod"

import {
  deleteDepositGuardMilestone,
  updateDepositGuardMilestone,
} from "@/lib/depositGuard/milestones"
import { createClient } from "@/lib/supabase/server"

const paramsSchema = z.object({ milestoneId: z.string().trim().min(1) })

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    sequence: z.number().int().min(1).optional(),
    amountType: z.enum(["percentage", "fixed"]).optional(),
    percentage: z.number().min(0).max(100).optional().nullable(),
    fixedAmountCents: z.number().int().min(0).optional().nullable(),
    triggerType: z.enum(["manual", "date", "work_status"]).optional(),
    targetDate: z.string().datetime().optional().nullable(),
    status: z
      .enum(["planned", "ready", "requested", "partially_paid", "paid", "overdue", "cancelled"])
      .optional(),
  })
  .strict()

function toFeatureError(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null
  if (error.message === "Upgrade required") {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }
  return null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ milestoneId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsedParams = paramsSchema.safeParse(await context.params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  const parsedBody = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 })
  }

  try {
    const targetDate =
      parsedBody.data.targetDate == null
        ? parsedBody.data.targetDate
        : new Date(parsedBody.data.targetDate)

    const updated = await updateDepositGuardMilestone(user.id, parsedParams.data.milestoneId, {
      ...parsedBody.data,
      targetDate,
    })

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ milestone: updated })
  } catch (error) {
    const accessError = toFeatureError(error)
    if (accessError) return accessError

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[PATCH /api/deposit-guard/milestones/[milestoneId]] Failed", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ milestoneId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsedParams = paramsSchema.safeParse(await context.params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  try {
    const deleted = await deleteDepositGuardMilestone(user.id, parsedParams.data.milestoneId)
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const accessError = toFeatureError(error)
    if (accessError) return accessError

    console.error("[DELETE /api/deposit-guard/milestones/[milestoneId]] Failed", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
