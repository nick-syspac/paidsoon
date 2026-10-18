import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  requireSubscriptionAccess,
  SubscriptionAccessError,
} from "@/lib/billing/accessGuard"

/** Authenticated subscription-controlled HTTP entrypoint, independent of proxy/layout.
 * Inner handlers retain their authentication, validation, feature checks and tenant RLS.
 * Never apply to billing/recovery, cleanup, public debtor links or system execution.
 */
export function withSubscriptionAccess<Args extends unknown[], Result extends Response>(
  handler: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result | NextResponse> {
  return async (...args) => {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
      await requireSubscriptionAccess(user.id)
    } catch (error) {
      if (error instanceof SubscriptionAccessError) {
        return NextResponse.json(error.result, { status: 403 })
      }
      // Do not turn an unavailable snapshot into authorization or disclose DB details.
      return NextResponse.json({ error: "Access verification unavailable" }, { status: 503 })
    }

    return handler(...args)
  }
}