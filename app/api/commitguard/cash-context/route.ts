import { NextResponse } from "next/server"
import { z } from "zod"
import { requireFeature } from "@/lib/billing"
import { withSubscriptionAccess } from "@/lib/billing/subscriptionRoute"
import { createCommitGuardCashContextSchema } from "@/lib/commitguard/cashContext"
import { loadCommitGuardCashContext } from "@/lib/commitguard/cashContextLoader"
import {
  CommitGuardCashContextConflict,
  saveCommitGuardCashContext,
} from "@/lib/commitguard/cashContextMutation"
import { createClient } from "@/lib/supabase/server"

async function handle(request: Request, mutate: boolean): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!await requireFeature(user.id, "commitguard_core")) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }
    if (!z.strictObject({}).safeParse(Object.fromEntries(new URL(request.url).searchParams)).success) {
      return NextResponse.json({ error: "Query parameters are not supported" }, { status: 400 })
    }
    const now = new Date()
    if (!mutate) {
      return NextResponse.json({ cashContext: await loadCommitGuardCashContext(user.id, now) })
    }
    const parsed = createCommitGuardCashContextSchema(now).safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      // Do not echo rejected keys, input values, or Zod's value-bearing enum messages.
      return NextResponse.json({ error: "Invalid cash context input" }, { status: 400 })
    }
    return NextResponse.json({ cashContext: await saveCommitGuardCashContext(user.id, parsed.data, now) })
  } catch (error) {
    if (error instanceof CommitGuardCashContextConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    // DB/Zod errors can contain financial values: never log the error object.
    console.error("[commitguard/cash-context] Request failed")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export const GET = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => handle(request, false))
export const PUT = withSubscriptionAccess(async (request: Request): Promise<NextResponse> => handle(request, true))