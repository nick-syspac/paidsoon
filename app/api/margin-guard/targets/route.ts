import { NextResponse } from "next/server"
import { z } from "zod"

import { validateMarginThresholds } from "@/lib/marginguard/engine"
import { requireMarginGuardCoreAccess } from "@/lib/marginguard/entitlements"
import { listMarginTargets, upsertMarginTarget } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const TargetSchema = z
  .object({
    scopeType: z.enum(["organization", "customer", "product_service", "category", "project_job"]),
    scopeKey: z.string().trim().min(1).max(160).optional().nullable(),
    targetGrossMarginPercent: z.number().gt(0).lt(100),
    warningGrossMarginPercent: z.number().min(0).max(99.99).optional().nullable(),
    criticalGrossMarginPercent: z.number().min(0).max(99.99).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .strict()

export async function GET(): Promise<NextResponse> {
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

  try {
    const targets = await listMarginTargets(user.id)
    return NextResponse.json({ targets })
  } catch (error) {
    console.error("[GET /api/margin-guard/targets] Failed to load targets", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
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
  const parsed = TargetSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const warning = parsed.data.warningGrossMarginPercent ?? parsed.data.targetGrossMarginPercent - 5
  const critical = parsed.data.criticalGrossMarginPercent ?? warning - 5

  try {
    validateMarginThresholds({
      targetPercent: parsed.data.targetGrossMarginPercent,
      warningPercent: warning,
      criticalPercent: critical,
    })

    const target = await upsertMarginTarget(user.id, {
      scopeType: parsed.data.scopeType,
      scopeKey: parsed.data.scopeKey ?? null,
      targetGrossMarginPercent: parsed.data.targetGrossMarginPercent,
      warningGrossMarginPercent: parsed.data.warningGrossMarginPercent,
      criticalGrossMarginPercent: parsed.data.criticalGrossMarginPercent,
      isActive: parsed.data.isActive,
      actorId: user.id,
    })

    return NextResponse.json({ target })
  } catch (error) {
    if (error instanceof Error && error.message.includes("critical < warning < target")) {
      return NextResponse.json({ error: "Thresholds must satisfy critical < warning < target" }, { status: 400 })
    }
    console.error("[PUT /api/margin-guard/targets] Failed to save target", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
