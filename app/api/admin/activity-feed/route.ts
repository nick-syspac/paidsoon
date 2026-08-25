import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(2),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const SESSION_ACTIONS = new Set(["impersonate_start", "impersonate_end", "impersonate_timeout"])
const DIRECT_ACTIONS = new Set([
  "update_schedule",
  "pause_invoices",
  "resume_invoices",
  "trigger_email",
  "mark_invoice_paid",
])

function dayLabel(date: Date): string {
  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((startToday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>
  try {
    ctx = await requireAdminElevation({ minRole: "platform_support" })
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

  const { days, limit } = parsed.data
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await prismaAdmin.adminAuditEvent.findMany({
    where: {
      actorUserId: ctx.userId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      adminSessionId: true,
      action: true,
      reason: true,
      targetUserId: true,
      details: true,
      createdAt: true,
    },
  })

  const targetUserIds = Array.from(new Set(events.map((event) => event.targetUserId).filter(Boolean))) as string[]
  const profiles = targetUserIds.length
    ? await prismaAdmin.userProfile.findMany({
        where: { userId: { in: targetUserIds } },
        select: { userId: true, displayName: true },
      })
    : []

  const displayNameByUser = new Map(profiles.map((profile) => [profile.userId, profile.displayName]))

  const sessionIds = Array.from(
    new Set(events.map((event) => event.adminSessionId).filter(Boolean)),
  ) as string[]
  const sessions = sessionIds.length
    ? await prismaAdmin.adminSession.findMany({
        where: { id: { in: sessionIds } },
        select: {
          id: true,
          impersonatedUserId: true,
          duration: true,
          actionCount: true,
          startedAt: true,
          endedAt: true,
        },
      })
    : []

  const sessionById = new Map(sessions.map((session) => [session.id, session]))

  const grouped: Record<string, Array<Record<string, unknown>>> = {}

  for (const event of events) {
    const label = dayLabel(event.createdAt)
    if (!grouped[label]) grouped[label] = []

    const session = event.adminSessionId ? sessionById.get(event.adminSessionId) : null
    const targetUserId = session?.impersonatedUserId ?? event.targetUserId
    const targetLabel = targetUserId ? displayNameByUser.get(targetUserId) ?? targetUserId : null

    let kind: "search" | "session" | "action" = "action"
    if (event.action === "customer_search") kind = "search"
    else if (SESSION_ACTIONS.has(event.action)) kind = "session"
    else if (DIRECT_ACTIONS.has(event.action)) kind = "action"

    grouped[label].push({
      id: event.id,
      kind,
      action: event.action,
      targetUserId,
      targetLabel,
      reason: event.reason,
      createdAt: event.createdAt,
      sessionId: event.adminSessionId,
      duration: session?.duration ?? null,
      actionCount: session?.actionCount ?? null,
      details: event.details,
      detailHref: event.adminSessionId
        ? `/admin/audit-log/session/${event.adminSessionId}`
        : `/admin/audit-log/event/${event.id}`,
    })
  }

  const summary = {
    searches: events.filter((event) => event.action === "customer_search").length,
    impersonations: events.filter((event) => SESSION_ACTIONS.has(event.action)).length,
    actions: events.filter((event) => DIRECT_ACTIONS.has(event.action)).length,
  }

  const customers = new Set<string>()
  for (const event of events) {
    if (event.targetUserId) customers.add(event.targetUserId)
    const session = event.adminSessionId ? sessionById.get(event.adminSessionId) : null
    if (session?.impersonatedUserId) customers.add(session.impersonatedUserId)
  }

  return NextResponse.json({
    summary: {
      ...summary,
      customers: customers.size,
    },
    groups: Object.entries(grouped).map(([label, items]) => ({ label, items })),
  })
}
