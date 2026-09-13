import { NextResponse } from "next/server"
import { z } from "zod"

import { generateDepositRequestFromMilestone } from "@/lib/depositGuard/milestones"
import { createClient } from "@/lib/supabase/server"

const paramsSchema = z.object({ milestoneId: z.string().trim().min(1) })
const bodySchema = z
  .object({
    dueDate: z.string().datetime().optional(),
  })
  .strict()

function toFeatureError(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null
  if (error.message === "Upgrade required") {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }
  return null
}

export async function POST(
  request: Request,
  context: { params: Promise<{ milestoneId: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsedParams = paramsSchema.safeParse(await context.params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 })
  }

  try {
    const result = await generateDepositRequestFromMilestone(user.id, parsedParams.data.milestoneId, {
      dueDate: parsedBody.data.dueDate ? new Date(parsedBody.data.dueDate) : undefined,
      actorUserId: user.id,
    })

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const accessError = toFeatureError(error)
    if (accessError) return accessError

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error(
      "[POST /api/deposit-guard/milestones/[milestoneId]/generate-request] Failed",
      error,
    )
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
