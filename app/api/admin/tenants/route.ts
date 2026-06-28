import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { logAdminEvent } from "@/lib/admin/audit"
import { getIpAddress, getUserAgent, generateRequestId } from "@/lib/admin/request"

/**
 * GET /api/admin/tenants
 * List tenants (UserProfile records). Safe data only — no raw credentials.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const { searchParams } = req.nextUrl
  const cursor = searchParams.get("cursor") ?? undefined
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)

  const tenants = await prismaAdmin.userProfile.findMany({
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      displayName: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      onboardingCompletedAt: true,
      createdAt: true,
      updatedAt: true,
      // stripeCustomerId and stripeSubscriptionId intentionally excluded
    },
  })

  const hasNextPage = tenants.length > limit
  const items = hasNextPage ? tenants.slice(0, -1) : tenants

  await logAdminEvent({
    actorUserId: ctx.userId,
    actorEmail: ctx.userEmail,
    platformRole: ctx.platformRole.role,
    action: "tenant_viewed",
    targetType: "tenant_list",
    ipAddress,
    userAgent,
    requestId,
    success: true,
  })

  return NextResponse.json({ items, nextCursor: hasNextPage ? items[items.length - 1]?.id : null })
}
