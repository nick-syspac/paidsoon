import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"
import { syncConnection } from "@/lib/providers/accounting/sync"

// Paginated invoice/contact fetches against the provider can take a while —
// raise the duration cap so a slow-but-successful sync isn't killed mid-request.
export const maxDuration = 60

const TriggerResyncSchema = z.object({
  connectionId: z.string().min(1),
})

/**
 * POST /api/admin/tenants/[id]/actions/trigger-resync
 *
 * Initiates a manual accounting sync for a specific AccountingConnection.
 * The connection must belong to the target tenant.
 *
 * Body: { connectionId: string }
 * Requires full admin elevation. Target [id] is the tenant's userId.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: tenantUserId } = await params
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation()
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  // Validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const parsed = TriggerResyncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { connectionId } = parsed.data

  // Verify connection belongs to tenant
  const connection = await prismaAdmin.accountingConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, userId: true, provider: true, organisationName: true },
  })
  if (!connection || connection.userId !== tenantUserId) {
    return NextResponse.json({ error: "Connection not found for this tenant" }, { status: 404 })
  }

  try {
    const result = await syncConnection(connectionId)
    // syncConnection never throws — it records failures on the result instead.
    // Reflect that outcome in the audit log so support can see whether the
    // manual resync actually succeeded, not just that the call completed.
    const succeeded = result.status === "success" || result.status === "partial"

    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      action: "admin_tenant_action",
      targetType: "accounting_connection",
      targetId: connectionId,
      tenantId: tenantUserId,
      ipAddress,
      userAgent,
      requestId,
      success: succeeded,
      reason: succeeded ? undefined : result.errorMessage,
      metadata: {
        action: "trigger-resync",
        connectionId,
        provider: connection.provider,
        organisationName: connection.organisationName,
        syncStatus: result.status,
        invoicesCreated: result.invoicesCreated,
        invoicesUpdated: result.invoicesUpdated,
        invoicesSkipped: result.invoicesSkipped,
      },
    })

    if (!succeeded) {
      return NextResponse.json(
        { success: false, error: result.errorMessage ?? "Sync did not complete successfully", result },
        { status: 502 }
      )
    }

    return NextResponse.json({ success: true, result })
  } catch (err) {
    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      action: "admin_tenant_action",
      targetType: "accounting_connection",
      targetId: connectionId,
      tenantId: tenantUserId,
      ipAddress,
      userAgent,
      requestId,
      success: false,
      reason: err instanceof Error ? err.message : "Unknown error",
      metadata: { action: "trigger-resync", connectionId, provider: connection.provider },
    })
    return NextResponse.json({ error: "Resync failed" }, { status: 500 })
  }
}
