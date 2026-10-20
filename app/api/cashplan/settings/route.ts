import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { defaultCashPlanSettings } from "@/lib/cashplan/engine"
import { CashPlanQuerySchema, loadCashPlan, presentCashPlan } from "@/lib/cashplan/service"
import { cashPlanRouteError } from "@/lib/cashplan/routeError"
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

import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
export const GET = withSubscriptionAccess(GETHandler)
export const PUT = withSubscriptionAccess(PUTHandler)
async function GETHandler(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = CashPlanQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  try {
    const assembly = await loadCashPlan(user.id, parsed.data)
    return NextResponse.json({ ...(assembly.inputs.configuration ?? defaultCashPlanSettings),
      alertThresholdCents: assembly.inputs.settings?.alertThresholdCents ?? 0,
      reviewRole: assembly.inputs.settings?.reviewRole ?? "owner",
      settingsSource: assembly.inputs.settingsSource, summary: presentCashPlan(assembly) })
  } catch (error) { return cashPlanRouteError(error) }
}

async function PUTHandler(request: Request) {
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
      planId: null,
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      horizonWeeks: parsed.data.horizonWeeks,
      bufferTargetCents: parsed.data.bufferTargetCents,
      alertThresholdCents: parsed.data.alertThresholdCents,
      reviewRole: parsed.data.reviewRole,
    }

    const existing = await tx.cashPlanSetting.findFirst({
      where: {
        userId: user.id,
        planId: null,
      },
    })

    if (existing) {
      return tx.cashPlanSetting.update({
        where: { id: existing.id },
        data: createData,
      })
    }

    return tx.cashPlanSetting.create({
      data: createData,
    })
  })

  return NextResponse.json(updated)
}
