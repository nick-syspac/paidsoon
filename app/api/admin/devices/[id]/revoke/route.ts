import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { revokeAllAdminSessionsForDevice } from "@/lib/admin/session"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

/**
 * POST /api/admin/devices/[id]/revoke
 *
 * Revoke an admin device. Cascades to all active AdminSession rows for that device.
 * Requires full admin elevation + platform_owner or platform_admin role.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: deviceId } = await params
  const ipAddress = getIpAddress(req)
  const userAgent = getUserAgent(req)
  const requestId = generateRequestId()

  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation({ minRole: "platform_admin" })
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  const device = await prismaAdmin.adminDevice.findUnique({
    where: { id: deviceId },
  })

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 })
  }

  if (device.status === "revoked") {
    return NextResponse.json({ error: "Device is already revoked" }, { status: 409 })
  }

  await prismaAdmin.adminDevice.update({
    where: { id: deviceId },
    data: { status: "revoked", revokedAt: new Date(), revokedBy: ctx.userId },
  })

  // Cascade revoke all active sessions for this device
  await revokeAllAdminSessionsForDevice(deviceId)

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: deviceId,
    adminDeviceFingerprint: device.publicKeyFingerprint,
    action: "device_revoked",
    targetType: "admin_device",
    targetId: deviceId,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ revoked: true })
}
