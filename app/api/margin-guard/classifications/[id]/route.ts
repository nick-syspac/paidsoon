import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardCoreAccess } from "@/lib/marginguard/entitlements"
import { updateMarginClassification } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const UpdateSchema = z
  .object({
    classification: z.enum(["DIRECT_COST", "VARIABLE_COST", "OVERHEAD", "EXCLUDED", "UNCLASSIFIED"]),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireMarginGuardCoreAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = UpdateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const params = await context.params
  try {
    const classification = await updateMarginClassification(user.id, params.id, {
      classification: parsed.data.classification,
      actorId: user.id,
      reason: parsed.data.reason,
    })

    if (!classification) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ classification })
  } catch (error) {
    console.error("[PATCH /api/margin-guard/classifications/:id] Failed to update classification", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
