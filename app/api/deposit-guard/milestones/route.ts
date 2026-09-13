import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createDepositGuardMilestone,
  listDepositGuardMilestones,
} from "@/lib/depositGuard/milestones"
import { createClient } from "@/lib/supabase/server"

const querySchema = z.object({
  jobId: z.string().trim().min(1).optional(),
})

const createSchema = z
  .object({
    jobId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    sequence: z.number().int().min(1),
    amountType: z.enum(["percentage", "fixed"]),
    percentage: z.number().min(0).max(100).optional().nullable(),
    fixedAmountCents: z.number().int().min(0).optional().nullable(),
    triggerType: z.enum(["manual", "date", "work_status"]).optional(),
    targetDate: z.string().datetime().optional().nullable(),
  })
  .strict()

function toFeatureError(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null
  if (error.message === "Upgrade required") {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }
  return null
}

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedQuery = querySchema.safeParse({
    jobId: new URL(request.url).searchParams.get("jobId") ?? undefined,
  })
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.flatten() }, { status: 400 })
  }

  try {
    const milestones = await listDepositGuardMilestones(user.id, parsedQuery.data)
    return NextResponse.json({ milestones })
  } catch (error) {
    const accessError = toFeatureError(error)
    if (accessError) return accessError

    console.error("[GET /api/deposit-guard/milestones] Failed to list milestones", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const milestone = await createDepositGuardMilestone(user.id, {
      ...parsed.data,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
    })

    return NextResponse.json({ milestone }, { status: 201 })
  } catch (error) {
    const accessError = toFeatureError(error)
    if (accessError) return accessError

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error("[POST /api/deposit-guard/milestones] Failed to create milestone", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
