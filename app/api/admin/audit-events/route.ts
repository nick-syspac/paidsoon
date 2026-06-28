import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { AdminAuditAction } from "@/lib/generated/prisma/enums"

const PAGE_SIZE = 50

const QuerySchema = z.object({
  actorUserId: z.string().optional(),
  action: z.nativeEnum(AdminAuditAction).optional(),
  tenantId: z.string().optional(),
  success: z.enum(["true", "false"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE).optional(),
})

/**
 * GET /api/admin/audit-events
 *
 * Return paginated AdminAuditEvent rows with optional filtering.
 * Requires full admin elevation (all three guard layers).
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
  const rawQuery = Object.fromEntries(searchParams.entries())
  const parsed = QuerySchema.safeParse(rawQuery)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const { actorUserId, action, tenantId, success, from, to, cursor, limit } = parsed.data

  const where: NonNullable<Parameters<typeof prismaAdmin.adminAuditEvent.findMany>[0]>["where"] = {}

  if (actorUserId) where.actorUserId = actorUserId
  if (action) where.action = action
  if (tenantId) where.tenantId = tenantId
  if (success !== undefined) where.success = success === "true"

  if (from || to) {
    where.createdAt = {}
    if (from) {
      const fromDate = new Date(from)
      if (isNaN(fromDate.getTime())) {
        return NextResponse.json({ error: "Invalid 'from' date" }, { status: 400 })
      }
      where.createdAt.gte = fromDate
    }
    if (to) {
      const toDate = new Date(to)
      if (isNaN(toDate.getTime())) {
        return NextResponse.json({ error: "Invalid 'to' date" }, { status: 400 })
      }
      where.createdAt.lte = toDate
    }
  }

  const take = (limit ?? PAGE_SIZE) + 1 // fetch one extra to determine if there's a next page

  const events = await prismaAdmin.adminAuditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      actorUserId: true,
      actorEmail: true,
      platformRole: true,
      adminDeviceId: true,
      adminDeviceFingerprint: true,
      action: true,
      targetType: true,
      targetId: true,
      tenantId: true,
      ipAddress: true,
      userAgent: true,
      requestId: true,
      success: true,
      reason: true,
      createdAt: true,
    },
  })

  const hasNextPage = events.length > (limit ?? PAGE_SIZE)
  const items = hasNextPage ? events.slice(0, -1) : events
  const nextCursor = hasNextPage ? items[items.length - 1]?.id : null

  return NextResponse.json({
    items,
    nextCursor,
    hasNextPage,
  })
}
