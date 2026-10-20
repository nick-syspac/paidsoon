import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireFeature } from "@/lib/billing"
import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
import { WorkspaceQuerySchema } from "@/lib/commitguard/workspace"
import { loadCommitGuardWorkspace } from "@/lib/commitguard/workspaceLoader"

export const GET = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => {
  const { data: { user }, error } = await (await createClient()).auth.getUser()
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!await requireFeature(user.id, "commitguard_core")) return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
  const entries = [...new URL(request.url).searchParams.entries()]
  const parsed = WorkspaceQuerySchema.safeParse(Object.fromEntries(entries))
  if (!parsed.success || entries.some(([key]) => ["__proto__", "constructor", "prototype"].includes(key)) || new Set(entries.map(([key]) => key)).size !== entries.length) {
    return NextResponse.json({ error: "Invalid workspace query" }, { status: 400 })
  }
  try {
    return NextResponse.json({ workspace: await loadCommitGuardWorkspace(user.id, parsed.data) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not load workspace" }, { status: 500 })
  }
})