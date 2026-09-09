import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { transitionCommitment } from "@/lib/commitguard/service"
import { createClient } from "@/lib/supabase/server"

const ParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const ActionSchema = z
  .object({
    action: z.enum(["pause", "resume", "cancel", "confirm"]),
  })
  .strict()

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const params = await context.params
  const parsedParams = ParamsSchema.safeParse(params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  const payload = await request.json().catch(() => null)
  const parsedBody = ActionSchema.safeParse(payload)
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 })
  }

  try {
    const result = await transitionCommitment(
      user.id,
      parsedParams.data.id,
      parsedBody.data.action,
      user.id,
    )

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[POST /api/commitguard/commitments/[id]/actions] Failed to transition commitment", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
