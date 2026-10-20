import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
import { AlertQuerySchema } from "@/lib/commitguard/alertPresentation"
import { listCommitGuardAlerts } from "@/lib/commitguard/alertHistory"

export const GET = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const params = new URL(request.url).searchParams
  const parsed = AlertQuerySchema.safeParse(Object.fromEntries(params))
  if (!parsed.success || [...params.keys()].some((key) => params.getAll(key).length > 1)) {
    return NextResponse.json({ error: "Invalid alert query" }, { status: 400 })
  }
  try {
    const alerts = await listCommitGuardAlerts(user.id, Object.fromEntries(params))
    return NextResponse.json(alerts, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof Error && error.message === "Upgrade required") return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    console.error("[CommitGuard alerts] History read failed")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
})