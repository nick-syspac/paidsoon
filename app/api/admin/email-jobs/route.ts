import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"

/**
 * GET /api/admin/email-jobs
 * List recent email log entries. clientEmail is never included.
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

  const emailLogs = await prismaAdmin.emailLog.findMany({
    orderBy: { sentAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      trackedInvoiceId: true,
      stage: true,
      sentAt: true,
      resendMessageId: true,
      fromAddress: true,
      subject: true,
      // clientEmail is intentionally excluded — never returned in admin responses
    },
  })

  const hasNextPage = emailLogs.length > limit
  const items = hasNextPage ? emailLogs.slice(0, -1) : emailLogs

  return NextResponse.json({ items, nextCursor: hasNextPage ? items[items.length - 1]?.id : null })
}
