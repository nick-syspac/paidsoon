import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

const ExtendTrialSchema = z.object({
  days: z.number().int().min(1).max(30),
})

/**
 * POST /api/admin/tenants/[id]/actions/extend-trial
 *
 * Extends the tenant's trial end date by N days (1–30).
 * Only valid for tenants currently in "trialing" subscriptionStatus.
 *
 * Body: { days: number }
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
  const parsed = ExtendTrialSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const { days } = parsed.data

  // Verify tenant exists and is trialing
  const profile = await prismaAdmin.userProfile.findUnique({
    where: { userId: tenantUserId },
    select: { userId: true, subscriptionStatus: true, trialEndsAt: true },
  })
  if (!profile) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }
  if (profile.subscriptionStatus !== "trialing") {
    return NextResponse.json(
      { error: "Tenant is not in trialing status", subscriptionStatus: profile.subscriptionStatus },
      { status: 409 }
    )
  }

  const previousTrialEndsAt = profile.trialEndsAt
  const newTrialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  try {
    await prismaAdmin.userProfile.update({
      where: { userId: tenantUserId },
      data: { trialEndsAt: newTrialEndsAt },
    })

    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      action: "admin_tenant_action",
      targetType: "user_profile",
      tenantId: tenantUserId,
      ipAddress,
      userAgent,
      requestId,
      success: true,
      metadata: {
        action: "extend-trial",
        days,
        previousTrialEndsAt: previousTrialEndsAt?.toISOString() ?? null,
        newTrialEndsAt: newTrialEndsAt.toISOString(),
      },
    })

    return NextResponse.json({ success: true, newTrialEndsAt: newTrialEndsAt.toISOString() })
  } catch (err) {
    await logAdminEvent({
      actorUserId: ctx.userId,
      actorEmail: ctx.userEmail,
      platformRole: ctx.platformRole.role,
      adminDeviceId: ctx.adminSession.adminDeviceId,
      action: "admin_tenant_action",
      targetType: "user_profile",
      tenantId: tenantUserId,
      ipAddress,
      userAgent,
      requestId,
      success: false,
      reason: err instanceof Error ? err.message : "Unknown error",
      metadata: { action: "extend-trial", days },
    })
    return NextResponse.json({ error: "Failed to extend trial" }, { status: 500 })
  }
}
