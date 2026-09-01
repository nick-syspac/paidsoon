import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"
import { TERMINAL_TRACKED_INVOICE_STATUSES } from "@/lib/invoiceImport/matching"
import { computeOutstanding, recordInvoicePayment } from "@/lib/invoices/payments"

const bodySchema = z.object({
  note: z.string().max(2000).optional(),
})

type Params = { params: Promise<{ id: string }> }

/**
 * Marks an invoice as fully paid by recording a payment for its entire
 * remaining outstanding balance — the same underlying path as manually
 * recording a partial payment (lib/invoices/payments.ts#recordInvoicePayment).
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const raw = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const result = await withUserContext(user.id, async (tx) => {
    const invoice = await tx.trackedInvoice.findFirst({
      where: { id, userId: user.id, status: { notIn: [...TERMINAL_TRACKED_INVOICE_STATUSES] } },
      include: { financialInvoice: { select: { amountDueCents: true, currency: true } } },
    })
    if (!invoice) return { ok: false as const, reason: "not_found" as const }

    const ledgerInvoice = {
      id: invoice.id,
      userId: invoice.userId,
      amountDue: invoice.financialInvoice.amountDueCents,
      status: invoice.status,
    }

    const payments = await tx.invoicePayment.findMany({
      where: { trackedInvoiceId: id },
      select: { amount: true },
    })
    const outstanding = computeOutstanding(ledgerInvoice, payments)
    if (outstanding <= 0) return { ok: false as const, reason: "no_balance" as const }

    const recorded = await recordInvoicePayment(tx, ledgerInvoice, {
      amount: outstanding,
      currency: invoice.financialInvoice.currency,
      source: "manual",
      note: parsed.data.note ?? null,
    })
    return { ok: true as const, recorded }
  })

  if (!result.ok) {
    if (result.reason === "no_balance") {
      return NextResponse.json({ error: "Invoice has no outstanding balance" }, { status: 400 })
    }
    return NextResponse.json({ error: "Not found or not payable" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    outstanding: result.recorded.outstanding,
    markedPaid: result.recorded.markedPaid,
  })
}
