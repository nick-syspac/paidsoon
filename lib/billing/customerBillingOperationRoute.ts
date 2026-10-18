import "server-only"
import { z } from "zod"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { customerBillingOperations } from "@/lib/billing/customerBillingOperations"
import { TenantBillingConflictError } from "@/lib/billing/tenantBillingFence"

export type BillingOperationRouteContext = { params: Promise<{ operationId: string }> }
const operationIdSchema = z.uuid().transform((value) => value.toLowerCase())
const emptyBody = z.object({}).strict()
const response = (body: unknown, status = 200): NextResponse =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

export async function customerBillingOperationRoute(
  request: Request, context: BillingOperationRouteContext, reconcile: boolean,
): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return response({ error: "Unauthorized" }, 401)
    if (reconcile) {
      // Exact Origin header, not Referer or caller-controlled forwarded host. Missing/null origins fail closed.
      if (request.headers.get("origin") !== new URL(request.url).origin ||
          request.headers.get("sec-fetch-site") === "cross-site") return response({ error: "Forbidden" }, 403)
      let body: unknown
      try { body = await request.json() } catch { return response({ error: "Invalid recovery body" }, 400) }
      if (!emptyBody.safeParse(body).success) return response({ error: "Invalid recovery body" }, 400)
    }
    const parsed = operationIdSchema.safeParse((await context.params).operationId)
    // Invalid/missing/foreign/admin IDs have the same absence contract.
    if (!parsed.success) return response({ error: "Not found" }, 404)
    const profile = await withUserContext(user.id, (tx) => tx.userProfile.findUnique({
      where: { userId: user.id }, select: { userId: true },
    }))
    if (!profile || profile.userId !== user.id) return response({ error: "Not found" }, 404)
    // Both journals remain unreadable through the customer role. Only this own-root
    // projection/recovery uses the documented narrow privileged billing service.
    if (!reconcile) return response(await customerBillingOperations.status(user.id, parsed.data))
    const result = await customerBillingOperations.reconcile(user.id, parsed.data)
    return response(result.body, result.httpStatus)
  } catch (error) {
    if (error instanceof TenantBillingConflictError) {
      if (["billing_operation_not_found", "billing_profile_missing"].includes(error.code)) return response({ error: "Not found" }, 404)
      if (error.code === "billing_execution_in_progress") return response({ error: "billing_execution_in_progress" }, 409)
    }
    // No provider/DB messages or PII in response or logs.
    console.error("[billing operation] Status/recovery unavailable")
    return response({ error: "billing_operation_unavailable" }, 503)
  }
}