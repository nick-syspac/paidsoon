import { NextResponse } from "next/server"
import { z } from "zod"

import { requireMarginGuardScenariosAccess } from "@/lib/marginguard/entitlements"
import { runMarginScenario } from "@/lib/marginguard/service"
import { createClient } from "@/lib/supabase/server"

const ScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    scenarioType: z.enum(["price_to_target", "cost_change", "mixed"]),
    directCostCents: z.number().int().min(0),
    revenueCents: z.number().int(),
    targetMarginPercent: z.number().gt(0).lt(100),
    currentPriceCents: z.number().int().optional().nullable(),
    directCostChangePercent: z.number().optional(),
    priceChangePercent: z.number().optional(),
    volumeChangePercent: z.number().optional(),
  })
  .strict()

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await requireMarginGuardScenariosAccess(user.id)
  } catch {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const payload = await request.json().catch(() => null)
  const parsed = ScenarioSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const scenario = await runMarginScenario(user.id, {
      ...parsed.data,
      actorId: user.id,
    })
    return NextResponse.json(scenario)
  } catch (error) {
    console.error("[POST /api/margin-guard/scenarios] Failed to run scenario", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
