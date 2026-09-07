import { NextRequest, NextResponse } from "next/server"
import { z } from "zod/v4"
import { prismaAdmin } from "@/lib/db/admin"
import { logAdminEvent } from "@/lib/admin/audit"
import { TERMINAL_TRACKED_INVOICE_STATUSES } from "@/lib/invoiceImport/matching"
import { computeOutstanding, recordInvoicePayment } from "@/lib/invoices/payments"
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
      status: { notIn: [...TERMINAL_TRACKED_INVOICE_STATUSES] },
    },
    include: { financialInvoice: { select: { amountDueCents: true, currency: true } } },
  })

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found or not payable" }, { status: 404 })
  }

  const ledgerInvoice = {
    id: invoice.id,
    userId: invoice.userId,
    amountDue: invoice.financialInvoice.amountDueCents,
    status: invoice.status,
  }

  const payments = await prismaAdmin.invoicePayment.findMany({
    where: { trackedInvoiceId: invoice.id },
    select: { amount: true },
  })
  const outstanding = computeOutstanding(ledgerInvoice, payments)
  if (outstanding <= 0) {
    return NextResponse.json({ error: "Invoice has no outstanding balance" }, { status: 400 })
  }

  const recorded = await recordInvoicePayment(prismaAdmin, ledgerInvoice, {
    amount: outstanding,
    currency: invoice.financialInvoice.currency,
    source: "manual",
    note: reason,
  })

  await logAdminEvent({
    actorUserId: guard.ctx.userId,
    actorEmail: guard.ctx.userEmail,
    platformRole: guard.ctx.platformRole.role,
    adminDeviceId: guard.ctx.adminSession.adminDeviceId,
    action: "mark_invoice_paid",
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
      outstandingBefore: outstanding,
      outstandingAfter: recorded.outstanding,
      markedPaid: recorded.markedPaid,
    },
  })

  return NextResponse.json({
    success: true,
    outstanding: recorded.outstanding,
    markedPaid: recorded.markedPaid,
  })
}
