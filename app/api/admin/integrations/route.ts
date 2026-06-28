import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"

/**
 * GET /api/admin/integrations
 * List accounting connections. All token fields are masked.
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
  const provider = searchParams.get("provider") ?? undefined

  const connections = await prismaAdmin.accountingConnection.findMany({
    where: provider ? { provider } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      provider: true,
      organisationName: true,
      status: true,
      lastSyncedAt: true,
      createdAt: true,
      updatedAt: true,
      // encryptedAccessToken, encryptedRefreshToken intentionally excluded
    },
  })

  const hasNextPage = connections.length > limit
  const items = hasNextPage ? connections.slice(0, -1) : connections

  return NextResponse.json({ items, nextCursor: hasNextPage ? items[items.length - 1]?.id : null })
}
