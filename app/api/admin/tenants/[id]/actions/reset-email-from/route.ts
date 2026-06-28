import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

/**
 * POST /api/admin/tenants/[id]/actions/reset-email-from
 *
 * Clears the tenant's custom From address (fromEmail, fromName, replyTo).
 * Logs the previous fromEmail in audit metadata so it can be manually restored.
 *
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

  // Verify tenant exists
  const profile = await prismaAdmin.userProfile.findUnique({
    where: { userId: tenantUserId },
    select: { userId: true },
  })
  if (!profile) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  // Fetch current email settings to capture old value for audit log
  const existingSettings = await prismaAdmin.emailSettings.findUnique({
    where: { userId: tenantUserId },
    select: { fromEmail: true },
  })

  const previousFromEmail = existingSettings?.fromEmail ?? null

  try {
    await prismaAdmin.emailSettings.updateMany({
      where: { userId: tenantUserId },
      data: { fromEmail: null, fromName: null, replyTo: null, resendVerified: false },
    })

    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      action: "admin_tenant_action",
      targetType: "email_settings",
      tenantId: tenantUserId,
      ipAddress,
      userAgent,
      requestId,
      success: true,
      metadata: { action: "reset-email-from", previousFromEmail },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      action: "admin_tenant_action",
      targetType: "email_settings",
      tenantId: tenantUserId,
      ipAddress,
      userAgent,
      requestId,
      success: false,
      reason: err instanceof Error ? err.message : "Unknown error",
      metadata: { action: "reset-email-from" },
    })
    return NextResponse.json({ error: "Failed to reset email From" }, { status: 500 })
  }
}
