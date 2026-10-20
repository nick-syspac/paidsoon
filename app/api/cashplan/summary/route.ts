import { NextResponse } from "next/server"
import { CashPlanQuerySchema, loadCashPlanSummary, refreshCashPlan } from "@/lib/cashplan/service"
import { cashPlanRouteError } from "@/lib/cashplan/routeError"
import { createClient } from "@/lib/supabase/server"

import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
export const GET = withSubscriptionAccess(GETHandler)
async function GETHandler(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = CashPlanQuerySchema.safeParse(Object.fromEntries(searchParams))

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try { return NextResponse.json(await loadCashPlanSummary(user.id, parsed.data)) }
  catch (error) { return cashPlanRouteError(error) }
}

export const POST = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const query = CashPlanQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  const parsed = CashPlanQuerySchema.safeParse(await request.json().catch(() => null))
  if (!query.success || !parsed.success || (query.data.planId && parsed.data.planId && query.data.planId !== parsed.data.planId)) {
    return NextResponse.json({ error: "Invalid refresh request" }, { status: 400 })
  }
  try { return NextResponse.json(await refreshCashPlan(user.id, { planId: parsed.data.planId ?? query.data.planId })) }
  catch (error) { return cashPlanRouteError(error) }
})
