import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { defaultCashPlanSettings } from "@/lib/cashplan/engine"
import { NextResponse } from "next/server"
import { z } from "zod"

const settingsSchema = z.object({
  currency: z.string().trim().min(3).max(3).default("aud"),
  timezone: z.string().trim().min(3).default("Australia/Sydney"),
  horizonWeeks: z.number().int().min(1).max(52).default(13),
  bufferTargetCents: z.number().int().nonnegative().default(0),
  alertThresholdCents: z.number().int().nonnegative().default(0),
  reviewRole: z.enum(["owner", "bookkeeper", "approver"]).default("owner"),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const settings = await withUserContext(user.id, async (tx) => {
    const existing = await tx.cashPlanSetting.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    })

    if (!existing) {
      return defaultCashPlanSettings
    }

    return {
      currency: existing.currency,
      timezone: existing.timezone,
      horizonWeeks: existing.horizonWeeks,
      bufferTargetCents: existing.bufferTargetCents,
      alertThresholdCents: existing.alertThresholdCents,
      reviewRole: existing.reviewRole,
    }
  })

  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const updated = await withUserContext(user.id, async (tx) => {
    const createData = {
      userId: user.id,
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      horizonWeeks: parsed.data.horizonWeeks,
      bufferTargetCents: parsed.data.bufferTargetCents,
      alertThresholdCents: parsed.data.alertThresholdCents,
      reviewRole: parsed.data.reviewRole,
    }

    return tx.cashPlanSetting.upsert({
      where: {
        userId_planId: {
          userId: user.id,
          planId: null as string | null,
        },
      },
      update: createData,
      create: createData,
    })
  })

  return NextResponse.json(updated)
}
