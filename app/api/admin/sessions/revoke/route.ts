import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requireAdminElevation, AdminGuardError, ADMIN_SESSION_COOKIE } from "@/lib/admin/guard"
import { revokeAdminSession } from "@/lib/admin/session"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

/**
 * POST /api/admin/sessions/revoke
 *
 * Revoke the current elevated admin session. Clears the admin_session cookie.
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
      const status = err.code === "unauthenticated" ? 401 : err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  await revokeAdminSession(ctx.adminSession.id)

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: ctx.adminSession.adminDeviceId,
    action: "admin_session_revoked",
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  // Clear the admin session cookie
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION_COOKIE)

  return NextResponse.json({ revoked: true })
}
