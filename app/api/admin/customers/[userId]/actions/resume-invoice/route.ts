import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { logAdminEvent } from "@/lib/admin/audit"
import {
  ActionReasonSchema,
  guardErrorResponse,
  requireSupportActionContext,
} from "@/lib/admin/supportActions"

const BodySchema = z
  .object({
    invoiceId: z.string().min(1),
    reason: ActionReasonSchema,
  })
  .strict()

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
  const { invoiceId, reason } = parsed.data

  const invoice = await prismaAdmin.trackedInvoice.findFirst({
    where: {
      id: invoiceId,
      userId,
      status: "paused",
    },
    select: {
      id: true,
      status: true,
      snoozedUntil: true,
    },
  })

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found or cannot be resumed" }, { status: 404 })
  }

  const updated = await prismaAdmin.trackedInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "pending",
    },
    select: {
      id: true,
      status: true,
      snoozedUntil: true,
    },
  })

  await logAdminEvent({
    actorUserId: guard.ctx.userId,
    actorEmail: guard.ctx.userEmail,
    platformRole: guard.ctx.platformRole.role,
    adminDeviceId: guard.ctx.adminSession.adminDeviceId,
    action: "resume_invoices",
    targetType: "tracked_invoice",
    targetId: invoice.id,
    targetUserId: userId,
    resourceId: invoice.id,
    reason,
    ipAddress: guard.requestMeta.ipAddress,
    userAgent: guard.requestMeta.userAgent,
    requestId: guard.requestMeta.requestId,
    success: true,
    details: {
      old: {
        status: invoice.status,
        snoozedUntil: invoice.snoozedUntil,
      },
      next: {
        status: updated.status,
        snoozedUntil: updated.snoozedUntil,
      },
    },
  })

  return NextResponse.json({ success: true, invoiceId: updated.id })
}
