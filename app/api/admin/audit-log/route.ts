import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { prismaAdmin } from "@/lib/db/admin"
import { AdminAuditAction } from "@/lib/generated/prisma/enums"

const QuerySchema = z.object({
  targetUserId: z.string().optional(),
  action: z.nativeEnum(AdminAuditAction).optional(),
  sessionId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(["asc", "desc"]).default("desc"),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAdminElevation({ minRole: "platform_support" })
  } catch (err) {
    if (err instanceof AdminGuardError) {
      const status = err.code === "unauthenticated" || err.code === "elevation_required" ? 401 : 403
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { targetUserId, action, sessionId, startDate, endDate, cursor, limit, sort } = parsed.data

  const where: NonNullable<Parameters<typeof prismaAdmin.adminAuditEvent.findMany>[0]>["where"] = {}

  if (targetUserId) where.targetUserId = targetUserId
  if (action) where.action = action
  if (sessionId) where.adminSessionId = sessionId

  if (startDate || endDate) {
    where.createdAt = {}

    if (startDate) {
      const parsedStart = new Date(startDate)
      if (Number.isNaN(parsedStart.getTime())) {
        return NextResponse.json({ error: "Invalid startDate" }, { status: 400 })
      }
      where.createdAt.gte = parsedStart
    }

    if (endDate) {
      const parsedEnd = new Date(endDate)
      if (Number.isNaN(parsedEnd.getTime())) {
        return NextResponse.json({ error: "Invalid endDate" }, { status: 400 })
      }
      where.createdAt.lte = parsedEnd
    }
  }

  const rows = await prismaAdmin.adminAuditEvent.findMany({
    where,
    orderBy: { createdAt: sort },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      adminSessionId: true,
      actorUserId: true,
      actorEmail: true,
      action: true,
      targetType: true,
      targetId: true,
      targetUserId: true,
      resourceId: true,
      reason: true,
      details: true,
      success: true,
      createdAt: true,
    },
  })

  const hasNextPage = rows.length > limit
  const items = hasNextPage ? rows.slice(0, -1) : rows

  const sessionIds = Array.from(new Set(items.map((row) => row.adminSessionId).filter(Boolean))) as string[]
  const sessions = sessionIds.length
    ? await prismaAdmin.adminSession.findMany({
        where: { id: { in: sessionIds } },
        select: {
          id: true,
          userId: true,
          impersonatedUserId: true,
          startedAt: true,
          endedAt: true,
          duration: true,
          actionCount: true,
        },
      })
    : []

  const sessionById = new Map(sessions.map((session) => [session.id, session]))

  const groupedBySession: Record<string, typeof items> = {}
  const withoutSession: typeof items = []

  for (const item of items) {
    if (item.adminSessionId) {
      if (!groupedBySession[item.adminSessionId]) groupedBySession[item.adminSessionId] = []
      groupedBySession[item.adminSessionId].push(item)
    } else {
      withoutSession.push(item)
    }
  }

  return NextResponse.json({
    items,
    groupedBySession,
    withoutSession,
    sessions: Object.fromEntries(Array.from(sessionById.entries())),
    nextCursor: hasNextPage ? items[items.length - 1]?.id ?? null : null,
    hasNextPage,
  })
}
