import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"

/**
 * GET /api/admin/users
 * List users with pagination and optional search by displayName/userId.
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
  const search = searchParams.get("search") ?? undefined
  const cursor = searchParams.get("cursor") ?? undefined
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100)

  const users = await prismaAdmin.userProfile.findMany({
    where: search
      ? {
          OR: [
            { displayName: { contains: search, mode: "insensitive" } },
            { userId: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      displayName: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      createdAt: true,
    },
  })

  const hasNextPage = users.length > limit
  const items = hasNextPage ? users.slice(0, -1) : users

  return NextResponse.json({ items, nextCursor: hasNextPage ? items[items.length - 1]?.id : null })
}
