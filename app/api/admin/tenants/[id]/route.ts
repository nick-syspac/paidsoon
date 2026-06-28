import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

/**
 * GET /api/admin/tenants/[id]
 * Get a single tenant (UserProfile) by internal profile ID. Safe data only.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
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

  const tenant = await prismaAdmin.userProfile.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      displayName: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      trialEndsAt: true,
      onboardingCompletedAt: true,
      createdAt: true,
      updatedAt: true,
      // Raw Stripe IDs intentionally excluded
    },
  })

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    action: "tenant_viewed",
    targetType: "user_profile",
    targetId: id,
    tenantId: tenant.userId,
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ tenant })
}
