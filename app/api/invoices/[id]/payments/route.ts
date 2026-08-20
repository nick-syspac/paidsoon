import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { NextResponse } from "next/server"
import { z } from "zod"
import { TERMINAL_TRACKED_INVOICE_STATUSES } from "@/lib/invoiceImport/matching"
import { recordInvoicePayment } from "@/lib/invoices/payments"

const bodySchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().min(1),
  note: z.string().max(2000).optional(),
})

type Params = { params: Promise<{ id: string }> }

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
    })
    if (!invoice) return { ok: false as const, reason: "not_found" as const }
    if (invoice.currency !== parsed.data.currency) {
      return { ok: false as const, reason: "currency_mismatch" as const }
    }

    const recorded = await recordInvoicePayment(tx, invoice, {
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      source: "manual",
      note: parsed.data.note ?? null,
    })
    return { ok: true as const, recorded }
  })

  if (!result.ok) {
    if (result.reason === "currency_mismatch") {
      return NextResponse.json({ error: "Payment currency must match the invoice's currency" }, { status: 400 })
    }
    return NextResponse.json({ error: "Not found or not payable" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    outstanding: result.recorded.outstanding,
    markedPaid: result.recorded.markedPaid,
  })
}
