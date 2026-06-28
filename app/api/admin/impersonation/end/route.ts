import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

/**
 * POST /api/admin/impersonation/end
 *
 * End tenant impersonation. Clears AdminSession.impersonatedTenantId.
 * Requires full admin elevation.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const previousTenantId = ctx.adminSession.impersonatedTenantId

  await prismaAdmin.adminSession.update({
    where: { id: ctx.adminSession.id },
    data: { impersonatedTenantId: null },
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: ctx.adminSession.adminDeviceId,
    action: "impersonation_ended",
    targetType: "user_profile",
    targetId: previousTenantId ?? undefined,
    tenantId: previousTenantId ?? undefined,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ impersonating: null })
}
