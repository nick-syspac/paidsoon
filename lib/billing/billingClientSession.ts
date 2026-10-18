import "server-only"
import { cache } from "react"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { billingClientScope } from "@/lib/billing/billingClientScope"

/** Only called after getUser authentication. Claims provide a stable session scope,
 * never authorization; an unavailable/mismatched session fails closed in the UI.
 */
export const getBillingClientScope = cache(async (userId: string): Promise<string> => {
  try {
    const client = await createClient()
    const { data, error } = await client.auth.getClaims()
    const claims = z.object({ sub: z.string(), session_id: z.uuid() }).safeParse(data?.claims)
    if (error || !claims.success || claims.data.sub !== userId) return ""
    return billingClientScope(userId, claims.data.session_id)
  } catch { return "" }
})