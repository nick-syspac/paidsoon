import { NextResponse } from "next/server"
import { z } from "zod"

import { requireFeature } from "@/lib/billing"
import { reviewDetectedCommitmentCandidate } from "@/lib/commitguard/detection"
import { CandidatePatchSchema } from "@/lib/commitguard/candidatePresentation"
import { createClient } from "@/lib/supabase/server"

const ParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const ReviewSchema = z
  .object({
    action: z.enum(["confirm", "ignore", "not_a_commitment", "edit"]),
    patch: CandidatePatchSchema.optional(),
  })
  .strict()
  .refine((value) => value.action === "edit" || value.patch === undefined, {
    path: ["patch"], message: "Patch is only supported for edit actions",
  })
  .refine((value) => value.action !== "edit" || value.patch !== undefined, {
    path: ["patch"], message: "Choose at least one correction",
  })

import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
export const POST = withSubscriptionAccess(POSTHandler)
async function POSTHandler(
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
    if (result.status === "conflict") {
      const error = result.reason === "conversion_review_required"
        ? "Conversion requires review"
        : result.reason === "candidate_already_converted"
          ? "Candidate already converted; use the existing commitment"
          : result.reason === "candidate_schedule_review_required"
            ? "Candidate schedule requires review; set a due date"
            : "Invalid candidate transition"
      return NextResponse.json({ ...result, error }, { status: 409 })
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    if (error instanceof Error && (error.message === "Upgrade required" || error.message === "Commitment limit reached")) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error("[POST /api/commitguard/detections/[id]/review] Failed to review candidate", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
