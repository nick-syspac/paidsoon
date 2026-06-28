import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"

/**
 * GET /api/admin/subscriptions
 * List subscription summary. Stripe card/payment details are masked.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminElevation()
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
  const tier = searchParams.get("tier") ?? undefined
  const status = searchParams.get("status") ?? undefined

  const profiles = await prismaAdmin.userProfile.findMany({
    where: {
      ...(tier ? { subscriptionTier: tier } : {}),
      ...(status ? { subscriptionStatus: status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      displayName: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      trialEndsAt: true,
      pendingDowngradeTier: true,
      createdAt: true,
      // stripeCustomerId, stripeSubscriptionId intentionally excluded — use Stripe dashboard for payment details
    },
  })

  const hasNextPage = profiles.length > limit
  const items = hasNextPage ? profiles.slice(0, -1) : profiles

  return NextResponse.json({ items, nextCursor: hasNextPage ? items[items.length - 1]?.id : null })
}
