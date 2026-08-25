import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"
import { beginSupportImpersonation } from "@/lib/admin/session"

// ---------------------------------------------------------------------------
// Schema: support both legacy tenantId and new userId (support console)
// ---------------------------------------------------------------------------

const RequestSchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    notifyCustomer: z.boolean().optional().default(false),
  })
  .refine((data) => data.tenantId != null || data.userId != null, {
    message: "Either tenantId or userId is required",
  })

/**
 * POST /api/admin/impersonation/start
 *
 * Two modes:
 *
 * Legacy — tenant sidebar impersonation:
 *   { tenantId } → sets AdminSession.impersonatedTenantId
 *
 * Support console — read-only customer view:
 *   { userId, notifyCustomer? } → sets AdminSession.impersonatedUserId
 *   Returns a redirectUrl to /dashboard?support_view=true
 *
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

  const { tenantId, userId, notifyCustomer } = parsed.data

  // ---------------------------------------------------------------------------
  // Support console mode: { userId, notifyCustomer }
  // ---------------------------------------------------------------------------
  if (userId != null) {
    const targetProfile = await prismaAdmin.userProfile.findUnique({
      where: { userId },
      select: { userId: true, displayName: true },
    })

    if (!targetProfile) {
      return NextResponse.json({ error: "Customer not found", code: "not_found" }, { status: 404 })
    }

    // Cannot impersonate a platform admin
    const targetRole = await prismaAdmin.platformRole.findUnique({ where: { userId } })
    if (targetRole) {
      return NextResponse.json(
        { error: "Cannot impersonate a platform admin user", code: "forbidden" },
        { status: 403 }
      )
    }

    await beginSupportImpersonation({
      adminSessionId: ctx.adminSession.id,
      adminUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      targetUserId: userId,
      targetDisplayName: targetProfile.displayName,
      notifyCustomer: notifyCustomer ?? false,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      requestMeta: {
        ipAddress,
        userAgent,
        requestId,
      },
    })

    const redirectUrl = `/dashboard?support_view=true&support_session=${ctx.adminSession.id}`
    return NextResponse.json({ impersonating: userId, redirectUrl })
  }

  // ---------------------------------------------------------------------------
  // Legacy mode: { tenantId }
  // ---------------------------------------------------------------------------
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
