import "server-only"
import { z } from "zod"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { createUserProfile } from "@/lib/actions/auth"
import { normalizeCustomerBillingIntent, type CustomerBillingIntent } from "@/lib/billing/customerBillingPlan"
import { customerBillingOperations } from "@/lib/billing/customerBillingOperations"
import { TenantBillingConflictError } from "@/lib/billing/tenantBillingFence"
import { StripeSnapshotError } from "@/lib/billing/stripeSubscriptions"

const safety = z.object({
  operationId: z.uuid().transform((value) => value.toLowerCase()),
  expectedVersion: z.string().regex(/^(0|[1-9]\d*)$/).transform(Number).pipe(z.number().int().nonnegative().safe()),
}).strict()
const empty = z.object({}).strict()
const checkout = z.object({ tier: z.string().optional() }).strict()
const downgrade = z.object({ tier: z.string() }).strict()
const response = (body: unknown, status = 200): NextResponse =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

/** Cookie-authenticated boundary only. RLS reads ownership; the narrow server-only
 * journal service reserves before dispatch and writes verified billing projections.
 * No customer-role billing writes, arbitrary provider input or entitlement gating.
 */
export async function customerBillingMutationRoute(request: Request, kind: CustomerBillingIntent["kind"]): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return response({ error: "Unauthorized" }, 401)
    if (request.headers.get("origin") !== new URL(request.url).origin ||
        request.headers.get("sec-fetch-site") === "cross-site") return response({ error: "Forbidden" }, 403)
    const parsed = safety.safeParse({ operationId: request.headers.get("idempotency-key"),
      expectedVersion: request.headers.get("x-billing-access-version") })
    if (!parsed.success) return response({ error: "Invalid billing safety headers" }, 400)
    if (new URL(request.url).search) return response({ error: "Invalid input" }, 400)
    let body: unknown
    try {
      const text = await request.text()
      body = text.length ? JSON.parse(text) : {}
    } catch { return response({ error: "Invalid input" }, 400) }
    const validated = (kind === "checkout" ? checkout : kind === "downgrade" ? downgrade : empty).safeParse(body)
    if (!validated.success) return response({ error: "Invalid input" }, 400)
    let intent: CustomerBillingIntent
    try { intent = normalizeCustomerBillingIntent(kind, "tier" in validated.data ? validated.data.tier : undefined) }
    catch { return response({ error: "Invalid input" }, 400) }
    const readProfile = () => withUserContext(user.id, (tx) => tx.userProfile.findUnique({ where: { userId: user.id } }))
    let profile = await readProfile()
    if (!profile && kind === "checkout") {
      // Preserve the existing idempotent auth bootstrap, never recreate a present trial.
      await createUserProfile(user.id)
      profile = await readProfile()
    }
    if (!profile || profile.userId !== user.id) return response({ error: "Profile not found" }, 404)
    const result = await customerBillingOperations.start({ ...parsed.data, intent, profile, email: user.email })
    return response(result.body, result.httpStatus)
  } catch (error) {
    if (error instanceof StripeSnapshotError && error.code.startsWith("conflicting_")) {
      return response({ error: "billing_conflict" }, 409)
    }
    if (error instanceof TenantBillingConflictError) {
      if (["billing_use_downgrade", "billing_invalid_downgrade", "billing_subscription_not_supported", "billing_schedule_missing"].includes(error.code)) {
        return response({ error: "Invalid billing action" }, 400)
      }
      if (error.code !== "billing_price_not_configured") {
        // Uniform across foreign keys, changed action/hash, reservations and stale versions.
        return response({ error: "billing_conflict" }, 409)
      }
    }
    console.error("[billing mutation] Operation unavailable")
    return response({ error: "billing_operation_unavailable" }, 503)
  }
}