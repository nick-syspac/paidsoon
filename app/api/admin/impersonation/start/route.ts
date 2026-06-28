import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

const RequestSchema = z.object({
  tenantId: z.string().min(1),
})

/**
 * POST /api/admin/impersonation/start
 *
 * Begin impersonating a tenant. Sets AdminSession.impersonatedTenantId.
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

  const { tenantId } = parsed.data

  // Validate tenant exists
  const tenant = await prismaAdmin.userProfile.findUnique({
    where: { userId: tenantId },
    select: { userId: true },
  })

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found", code: "tenant_not_found" }, { status: 404 })
  }

  // Cannot impersonate another admin
  const targetRole = await prismaAdmin.platformRole.findUnique({
    where: { userId: tenantId },
  })
  if (targetRole) {
    return NextResponse.json({ error: "Cannot impersonate a platform admin user", code: "forbidden" }, { status: 403 })
  }

  await prismaAdmin.adminSession.update({
    where: { id: ctx.adminSession.id },
    data: { impersonatedTenantId: tenantId },
  })

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    adminDeviceId: ctx.adminSession.adminDeviceId,
    action: "impersonation_started",
    targetType: "user_profile",
    targetId: tenantId,
    tenantId,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ impersonating: tenantId })
}
