import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { reviewDetectedCommitmentCandidate } from "@/lib/commitguard/detection"
import { createClient } from "@/lib/supabase/server"

const ParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const ReviewSchema = z
  .object({
    action: z.enum(["confirm", "ignore", "not_a_commitment", "edit"]),
    patch: z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        category: z.string().trim().min(1).max(80).optional(),
        frequency: z
          .enum(["one_off", "weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual", "custom"])
          .optional(),
        typicalAmountCents: z.number().int().min(0).optional(),
        confidence: z.enum(["confirmed", "high", "medium", "low"]).optional(),
        source: z
          .enum([
            "manual",
            "accounting_integration",
            "bank_transaction_pattern",
            "spendleak",
            "costguard",
            "import",
            "system_inferred",
          ])
          .optional(),
      })
      .strict()
      .optional(),
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

  const [hasCoreFeature, hasDetectionFeature] = await Promise.all([
    requireFeature(user.id, "commitguard_core"),
    requireFeature(user.id, "commitguard_detection"),
  ])

  if (!hasCoreFeature || !hasDetectionFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const params = await context.params
  const parsedParams = ParamsSchema.safeParse(params)
  if (!parsedParams.success) {
    return NextResponse.json({ error: parsedParams.error.flatten() }, { status: 400 })
  }

  const payload = await request.json().catch(() => null)
  const parsedBody = ReviewSchema.safeParse(payload)
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 })
  }

  try {
    const result = await reviewDetectedCommitmentCandidate({
      userId: user.id,
      candidateId: parsedParams.data.id,
      action: parsedBody.data.action,
      patch: parsedBody.data.patch,
      actorId: user.id,
    })

    if (result.status === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[POST /api/commitguard/detections/[id]/review] Failed to review candidate", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
