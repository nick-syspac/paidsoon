import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"

const updateSchema = z.object({
  materialityPercent: z.number().min(0, "Alert sensitivity must be at least 0%").max(100, "Alert sensitivity must be 100% or less"),
  materialityCents: z.number().int("Minimum materiality must be a whole dollar amount in cents").nonnegative("Minimum materiality cannot be negative"),
  defaultLookbackDays: z.number().int("Lookback window must be a whole number of days").min(1, "Lookback window must be at least 1 day").max(3650, "Lookback window must be 3650 days or less"),
  alertDigestMode: z.enum(["daily", "weekly", "monthly"], {
    error: "Digest frequency must be daily, weekly, or monthly",
  }),
})

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const updated = await withUserContext(user.id, (tx) =>
      tx.costGuardSetting.upsert({
        where: { userId: user.id },
        update: {
          materialityPercent: parsed.data.materialityPercent,
          materialityCents: parsed.data.materialityCents,
          defaultLookbackDays: parsed.data.defaultLookbackDays,
          alertDigestMode: parsed.data.alertDigestMode,
        },
        create: {
          userId: user.id,
          materialityPercent: parsed.data.materialityPercent,
          materialityCents: parsed.data.materialityCents,
          defaultLookbackDays: parsed.data.defaultLookbackDays,
          alertDigestMode: parsed.data.alertDigestMode,
        },
      }),
    )

    return NextResponse.json(updated)
  } catch (error) {
    console.error("[PUT /api/settings/cost-guard] Failed to save settings:", error)
    return NextResponse.json({ error: "Failed to save Cost Guard settings" }, { status: 500 })
  }
}
