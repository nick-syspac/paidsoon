import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { AdminGuardError } from "@/lib/admin/guard"
import { requireTrialAccessOwner } from "@/lib/admin/trialAccessAuthority"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"
import { readScopedTrialOperation, readTrialManagementSnapshot, readTrialOperationStatus } from "@/lib/admin/trialAccessManagement"
import { projectTrialNotification, projectTrialOutcome, projectTrialPreview } from "@/lib/admin/trialAccessProjection"
import { TrialPreviewError, createTrialAccessPreviewService } from "@/lib/billing/trialAccessPreview"
import { trialAccessConfirmationSchema, trialAccessPreviewSchema } from "@/lib/billing/trialAccessInput"
import { createTrialAccessOperationService } from "@/lib/billing/trialAccessOperations"
import { createStripeTrialExtensionService } from "@/lib/billing/stripeTrialExtension"
import { createStripeTrialRecoveryService } from "@/lib/billing/stripeTrialRecovery"
import { createTrialAccessDeliveryService } from "@/lib/email/trialAccessDelivery"
import { TenantBillingConflictError } from "@/lib/billing/tenantBillingFence"
import { createStripeClient } from "@/lib/billing/stripeClient"
import { prismaAdmin } from "@/lib/db/admin"

export type TrialAccessRouteContext = { params: Promise<{ id: string; operationId?: string }> }
type Action = "snapshot" | "preview" | "confirm" | "extend-stripe" | "status" | "reconcile" | "retry"
const paths = z.strictObject({ id: z.uuid(), operationId: z.uuid().optional() })
const empty = z.strictObject({})
const response = (body: unknown, status = 200): NextResponse =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

/** Thin transport: guard BEFORE params/body/target reads; strict POST envelopes;
 * every business service reauthorizes. No caller-controlled source/intent dispatch. */
export async function trialAccessRoute(request: NextRequest, context: TrialAccessRouteContext, action: Action): Promise<NextResponse> {
  try {
    const owner = await requireTrialAccessOwner()
    const url = z.url().parse(request.url)
    if (new URL(url).search) return response({ error: "Invalid query" }, 400)
    const mutation = !["snapshot", "status"].includes(action)
    if (mutation && (request.headers.get("origin") !== new URL(url).origin ||
        request.headers.get("sec-fetch-site") === "cross-site")) return response({ error: "Forbidden" }, 403)
    const params = paths.safeParse(await context.params)
    if (!params.success) return response({ error: "Invalid path" }, 400)
    const userId = params.data.id.toLowerCase(), operationId = params.data.operationId?.toLowerCase()
    if (["status", "reconcile", "retry"].includes(action) && !operationId) return response({ error: "Invalid path" }, 400)
    let body: unknown
    if (mutation) {
      try { body = await request.json() } catch { return response({ error: "Invalid JSON body" }, 400) }
      const schema = action === "preview" ? trialAccessPreviewSchema : ["confirm", "extend-stripe"].includes(action) ? trialAccessConfirmationSchema : empty
      const parsed = schema.safeParse(body)
      if (!parsed.success) return response({ error: "Invalid request body" }, 400)
      // Validate without replacing the raw input: preview services normalize time
      // and hash the exact canonical intent themselves (including offset checks).
    }
    if (action === "snapshot") return response(await readTrialManagementSnapshot(userId))
    if (action === "status") {
      const state = await readTrialOperationStatus(userId, operationId!, owner)
      return response(state, state.reconciliationRequired ? 202 : state.result?.status === "failed" ? 502 : 200)
    }
    const requestMeta = { ipAddress: getIpAddress(request), userAgent: getUserAgent(request), requestId: generateRequestId() }
    const dependencies = { authorize: requireTrialAccessOwner, now: () => new Date(),
      stripe: () => createStripeClient({ maxNetworkRetries: 0 }),
      // Explicit privileged owner workflow, never an RLS/customer billing patch.
      transaction: <T>(run: (tx: import("@/lib/generated/prisma/client").Prisma.TransactionClient) => Promise<T>) =>
        prismaAdmin.$transaction(run, { timeout: 20000 }) }
    if (action === "preview") return response(projectTrialPreview(await createTrialAccessPreviewService(dependencies).preview(userId, body)))
    if (action === "retry") {
      await readScopedTrialOperation(userId, operationId!, owner, true)
      // Delivery service independently enforces ORIGINAL actor/session; no access mutation.
      return response({ operationId, notification: projectTrialNotification(await createTrialAccessDeliveryService().retry(userId, operationId!, requestMeta)) })
    }
    if (action === "confirm" || action === "extend-stripe") {
      const input = trialAccessConfirmationSchema.parse(body)
      const op = await readScopedTrialOperation(userId, input.operationId.toLowerCase(), owner, true)
      // Compatibility confirms ONLY stored Stripe-extension intent. Never route
      // an application grant/revocation (even a completed replay) through here.
      if (action === "extend-stripe" && (op.source !== "stripe_trial" || op.action !== "extend_or_grant")) {
        return response({ error: "trial_stripe_intent_required" }, 409)
      }
      const outcome = op.source === "stripe_trial"
        ? await createStripeTrialExtensionService(dependencies).confirm(userId, body, requestMeta)
        : await createTrialAccessOperationService(dependencies).confirm(userId, body, requestMeta)
      return outcomeResponse(outcome)
    }
    const op = await readScopedTrialOperation(userId, operationId!, owner, false)
    if (op.source !== "stripe_trial") {
      // Local transactions have no uncertain provider effect to recover. A
      // terminal local operation is a read-only replay, NOT a new confirmation.
      if (op.status !== "succeeded" || !op.result) return response({ error: "trial_recovery_not_available" }, 409)
      return outcomeResponse(op.result)
    }
    return outcomeResponse(await createStripeTrialRecoveryService(dependencies).reconcile(userId, operationId!, body, requestMeta))
  } catch (error) {
    if (error instanceof AdminGuardError) return response({ error: "Admin authorization required", code: error.code },
      ["unauthenticated", "elevation_required"].includes(error.code) ? 401 : 403)
    if (error instanceof TrialPreviewError) return response({ error: error.status === 404 ? "Not found" : error.code }, error.status)
    if (error instanceof TenantBillingConflictError) return response({ error: "trial_billing_conflict" }, 409)
    if (error instanceof z.ZodError) return response({ error: "Invalid request body" }, 400)
    // No raw errors, reason, email, provider parameters or keys in logs/responses.
    console.error("[trial management] Request unavailable")
    return response({ error: "trial_operation_unavailable" }, 503)
  }
}

function outcomeResponse(raw: unknown): NextResponse {
  const value = projectTrialOutcome(raw)
  const status = ["pending", "reconciliation_required"].includes(value.status) ? 202 : value.status === "failed" ? 502 : 200
  return response(value, status)
}