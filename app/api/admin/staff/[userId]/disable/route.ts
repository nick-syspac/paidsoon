import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { revokeAllAdminSessionsForUser } from "@/lib/admin/session"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

/**
 * POST /api/admin/staff/[userId]/disable
 *
 * Disable a staff member's platform role and revoke all their admin sessions.
 * Only platform_owner may call this.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const { userId: targetUserId } = await params
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation({ minRole: "platform_owner" })
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  if (targetUserId === ctx.userId) {
    return NextResponse.json({ error: "Cannot disable your own account", code: "self_disable" }, { status: 400 })
  }

  const target = await prismaAdmin.platformRole.findUnique({
    where: { userId: targetUserId },
  })

  if (!target) {
    return NextResponse.json({ error: "Staff member not found", code: "not_found" }, { status: 404 })
  }

  if (target.status === "disabled") {
    return NextResponse.json({ error: "Staff member is already disabled", code: "already_disabled" }, { status: 409 })
  }

  await prismaAdmin.platformRole.update({
    where: { userId: targetUserId },
    data: { status: "disabled" },
  })

  // Revoke all active admin sessions for the disabled user
  await revokeAllAdminSessionsForUser(targetUserId)

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    action: "staff_disabled",
    targetType: "platform_role",
    targetId: target.id,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ disabled: true })
}
