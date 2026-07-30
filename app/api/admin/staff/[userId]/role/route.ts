import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

const RequestSchema = z.object({
  role: z.enum(["platform_admin", "platform_support"]),
})

/**
 * POST /api/admin/staff/[userId]/role
 *
 * Update a staff member's platform role. Only platform_owner may call this.
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

  // Cannot change your own role via this endpoint
  if (targetUserId === ctx.userId) {
    return NextResponse.json({ error: "Cannot change your own role", code: "self_role_change" }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { role } = parsed.data

  const target = await prismaAdmin.platformRole.findUnique({
    where: { userId: targetUserId },
  })

  if (!target) {
    return NextResponse.json({ error: "Staff member not found", code: "not_found" }, { status: 404 })
  }

  if (target.role === "platform_owner") {
    return NextResponse.json({ error: "Cannot change the role of the platform owner", code: "forbidden" }, { status: 403 })
  }

  const updated = await prismaAdmin.platformRole.update({
    where: { userId: targetUserId },
    data: { role },
    select: { id: true, userId: true, role: true, status: true },
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    action: "role_changed",
    targetType: "platform_role",
    targetId: updated.id,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ role: updated })
}
