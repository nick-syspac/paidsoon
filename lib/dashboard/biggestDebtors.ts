import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import { daysBetween } from "@/lib/dashboard/format"
import { computeOutstanding, type LedgerPayment } from "@/lib/invoices/payments"

export interface DebtorSummary {
  clientEmail: string
  clientName: string
  /** cents, summed across every active invoice owed by this debtor */
  amountOwed: number
  currency: string
  invoiceCount: number
  maxDaysOverdue: number
}

/**
 * Groups active invoices by debtor and ranks by total amount owed, for the
 * "Biggest Debtors" widget.
 */
export function buildBiggestDebtors(
  invoices: (Pick<
    InvoiceWithRelations,
    "clientEmail" | "clientName" | "amountDue" | "currency" | "dueDate"
  > & { payments: LedgerPayment[] })[],
  now: Date = new Date(),
  limit = 5,
): DebtorSummary[] {
  const byEmail = new Map<string, DebtorSummary>()

  for (const invoice of invoices) {
    const key = invoice.clientEmail.toLowerCase()
    const overdue = daysBetween(new Date(invoice.dueDate), now)
    const outstanding = computeOutstanding(invoice, invoice.payments)
    const existing = byEmail.get(key)
    if (existing) {
      existing.amountOwed += outstanding
      existing.invoiceCount += 1
      existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, overdue)
    } else {
      byEmail.set(key, {
        clientEmail: invoice.clientEmail,
        clientName: invoice.clientName,
        amountOwed: outstanding,
        currency: invoice.currency,
        invoiceCount: 1,
        maxDaysOverdue: overdue,
      })
    }
  }

  return [...byEmail.values()].sort((a, b) => b.amountOwed - a.amountOwed).slice(0, limit)
}
