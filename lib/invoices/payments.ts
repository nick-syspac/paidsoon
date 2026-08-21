import type { PrismaTx } from "@/lib/db/withUserContext"
import type { InvoicePayment, TrackedInvoice } from "@/lib/generated/prisma/client"

/**
 * Computes an invoice's current outstanding balance: its original `amountDue`
 * minus every payment recorded against it in the ledger, floored at 0 so an
 * overpayment never reports a negative balance owed.
 */
export function computeOutstanding(
  invoice: Pick<TrackedInvoice, "amountDue">,
  payments: Pick<InvoicePayment, "amount">[],
): number {
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  return Math.max(0, invoice.amountDue - totalPaid)
}

export type InvoicePaymentSource = "manual" | "import_reconciliation"

/** The minimal shape needed to compute an outstanding balance — narrower than the full ledger row. */
export type LedgerPayment = Pick<InvoicePayment, "amount">

export interface RecordInvoicePaymentResult {
  payment: InvoicePayment
  /** Outstanding balance after this payment is applied. */
  outstanding: number
  markedPaid: boolean
}

/**
 * Appends a payment to an invoice's ledger and flips its status to `paid`
 * once the ledger fully covers `amountDue`. The single underlying code path
 * for every way money gets applied to an invoice (manual recording, "mark as
 * paid", and import reconciliation), per design.md.
 */
export async function recordInvoicePayment(
  tx: PrismaTx,
  invoice: Pick<TrackedInvoice, "id" | "userId" | "amountDue" | "status">,
  params: { amount: number; currency: string; source: InvoicePaymentSource; note?: string | null },
): Promise<RecordInvoicePaymentResult> {
  const priorPayments = await tx.invoicePayment.findMany({
    where: { trackedInvoiceId: invoice.id },
    select: { amount: true },
  })
  const priorOutstanding = computeOutstanding(invoice, priorPayments)

  const payment = await tx.invoicePayment.create({
    data: {
      trackedInvoiceId: invoice.id,
      userId: invoice.userId,
      amount: params.amount,
      currency: params.currency,
      source: params.source,
      note: params.note ?? null,
    },
  })

  const outstanding = Math.max(0, priorOutstanding - params.amount)
  const markedPaid = outstanding <= 0 && invoice.status !== "paid"
  if (markedPaid) {
    await tx.trackedInvoice.update({ where: { id: invoice.id }, data: { status: "paid" } })
  }

  return { payment, outstanding, markedPaid }
}
