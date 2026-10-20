import { NextResponse } from "next/server"

import { requireFeature } from "@/lib/billing"
import { summarizeCommitGuard } from "@/lib/commitguard/service"
import { CommitGuardSummaryQuerySchema, COMMIT_GUARD_QUERY_MIGRATION_MESSAGE } from "@/lib/commitguard/summary"
import { createClient } from "@/lib/supabase/server"

import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
export const GET = withSubscriptionAccess(GETHandler)
async function GETHandler(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user }, error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hasFeature = await requireFeature(user.id, "commitguard_core")
  if (!hasFeature) {
    return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = CommitGuardSummaryQuerySchema.safeParse([...searchParams.entries()])

  if (!parsed.success) {
    return NextResponse.json({ error: COMMIT_GUARD_QUERY_MIGRATION_MESSAGE }, { status: 400 })
  }

  try {
    const summary = await summarizeCommitGuard({ userId: user.id })

    return NextResponse.json({ summary })
  } catch (error) {
    console.error("[GET /api/commitguard/summary] Failed to load CommitGuard summary", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
