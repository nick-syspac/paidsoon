import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"

export interface PaymentTrendPoint {
  label: string
  date: Date
  /** cents outstanding as of the end of this week */
  outstanding: number
  /** cents paid during this week */
  paymentsReceived: number
}

/**
 * Builds a weekly time series for the "Payment Trend" chart: outstanding
 * balance and payments received. Outstanding is approximated from invoices
 * already loaded (active + recently-paid) — an invoice created on/before a
 * given week-end that either is still active today or wasn't paid until
 * after that week-end counts as outstanding at that point in time.
 * `manually_resolved` invoices aren't loaded on the dashboard and are
 * excluded from this approximation.
 */
export function buildPaymentTrend(input: {
  activeInvoices: Pick<InvoiceWithRelations, "amountDue" | "createdAt">[]
  paidInvoices: Pick<PaidInvoiceSummary, "amountDue" | "createdAt" | "updatedAt">[]
  now?: Date
  weeks?: number
}): PaymentTrendPoint[] {
  const now = input.now ?? new Date()
  const weeks = input.weeks ?? 8
  const points: PaymentTrendPoint[] = []

  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now)
    weekEnd.setUTCDate(weekEnd.getUTCDate() - i * 7)
    const weekStart = new Date(weekEnd)
    weekStart.setUTCDate(weekStart.getUTCDate() - 7)

    const outstandingFromActive = input.activeInvoices
      .filter((invoice) => new Date(invoice.createdAt) <= weekEnd)
      .reduce((sum, invoice) => sum + invoice.amountDue, 0)

    const outstandingFromPaid = input.paidInvoices
      .filter((invoice) => new Date(invoice.createdAt) <= weekEnd && new Date(invoice.updatedAt) > weekEnd)
      .reduce((sum, invoice) => sum + invoice.amountDue, 0)

    const paymentsReceived = input.paidInvoices
      .filter((invoice) => {
        const paidAt = new Date(invoice.updatedAt)
        return paidAt > weekStart && paidAt <= weekEnd
      })
      .reduce((sum, invoice) => sum + invoice.amountDue, 0)

    points.push({
      label: weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      date: weekEnd,
      outstanding: outstandingFromActive + outstandingFromPaid,
      paymentsReceived,
    })
  }

  return points
}
