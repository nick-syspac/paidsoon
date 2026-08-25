import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { logAdminEvent } from "@/lib/admin/audit"
import {
  ActionReasonSchema,
  guardErrorResponse,
  requireSupportActionContext,
} from "@/lib/admin/supportActions"

const BodySchema = z.object({ reason: ActionReasonSchema }).strict()

type Params = { params: Promise<{ userId: string }> }

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  let guard
  try {
    guard = await requireSupportActionContext(req)
  } catch (err) {
    return guardErrorResponse(err)
  }

  const raw = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { userId } = await params

  const result = await prismaAdmin.trackedInvoice.updateMany({
    where: {
      userId,
      status: { in: ["pending", "snoozed"] },
    },
    data: {
      status: "paused",
      snoozedUntil: null,
    },
  })

  await logAdminEvent({
    actorUserId: guard.ctx.userId,
    actorEmail: guard.ctx.userEmail,
    platformRole: guard.ctx.platformRole.role,
    adminDeviceId: guard.ctx.adminSession.adminDeviceId,
    action: "pause_invoices",
    targetType: "user_profile",
    targetId: userId,
    targetUserId: userId,
    reason: parsed.data.reason,
    ipAddress: guard.requestMeta.ipAddress,
    userAgent: guard.requestMeta.userAgent,
    requestId: guard.requestMeta.requestId,
    success: true,
    details: { count: result.count },
  })

  return NextResponse.json({ success: true, pausedCount: result.count })
}
