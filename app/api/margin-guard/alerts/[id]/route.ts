import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardAlertsAccess } from "@/lib/marginguard/entitlements"
import { transitionMarginAlert } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const UpdateSchema = z
  .object({
    status: z.enum(["acknowledged", "resolved", "dismissed", "open"]),
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
    await requireMarginGuardAlertsAccess(user.id)
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
    const alert = await transitionMarginAlert(user.id, params.id, parsed.data.status, user.id, parsed.data.reason)
    if (!alert) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ alert })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid alert state transition")) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[PATCH /api/margin-guard/alerts/:id] Failed to update alert", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
