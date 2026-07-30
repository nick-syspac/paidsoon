import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"

/** Average days between an invoice entering PaidSoon (`createdAt`) and being marked paid (`updatedAt`). */
export function computeAverageDaysToPayment(paidInvoices: Pick<PaidInvoiceSummary, "createdAt" | "updatedAt">[]): number | null {
  if (paidInvoices.length === 0) return null
  const totalDays = paidInvoices.reduce((sum, invoice) => {
    const days = Math.max(
      0,
      Math.floor((new Date(invoice.updatedAt).getTime() - new Date(invoice.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
    )
    return sum + days
  }, 0)
  return Math.round((totalDays / paidInvoices.length) * 10) / 10
}

/** Share of resolved invoices (paid + manually written off) that were actually paid, all-time. */
export function computeCollectionRatePercent(paidCountAllTime: number, manuallyResolvedCountAllTime: number): number | null {
  const resolvedTotal = paidCountAllTime + manuallyResolvedCountAllTime
  if (resolvedTotal === 0) return null
  return Math.round((paidCountAllTime / resolvedTotal) * 1000) / 10
}

/** Sum of amounts paid on or after `since`. */
export function sumPaidSince(paidInvoices: Pick<PaidInvoiceSummary, "amountDue" | "updatedAt">[], since: Date): number {
  return paidInvoices
    .filter((invoice) => new Date(invoice.updatedAt) >= since)
    .reduce((sum, invoice) => sum + invoice.amountDue, 0)
}

export interface RecentPayment {
  id: string
  clientName: string
  amountDue: number
  currency: string
  paidAt: Date
}

/** Last N paid invoices for the "Recent Payments" widget (`paidInvoices` is already ordered by `updatedAt desc`). */
export function buildRecentPayments(paidInvoices: PaidInvoiceSummary[], limit = 10): RecentPayment[] {
  return paidInvoices.slice(0, limit).map((invoice) => ({
    id: invoice.id,
    clientName: invoice.clientName,
    amountDue: invoice.amountDue,
    currency: invoice.currency,
    paidAt: invoice.updatedAt,
  }))
}

export interface CollectionPerformance {
  recoveredThisWeek: number
  recoveredThisMonth: number
  averageDaysToPayment: number | null
  collectionRatePercent: number | null
}

/** Powers the "Collection Performance" widget. */
export function buildCollectionPerformance(input: {
  paidInvoices: PaidInvoiceSummary[]
  paidCountAllTime: number
  manuallyResolvedCountAllTime: number
  now?: Date
}): CollectionPerformance {
  const now = input.now ?? new Date()
  const weekStart = new Date(now)
  weekStart.setUTCDate(weekStart.getUTCDate() - 7)
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  return {
    recoveredThisWeek: sumPaidSince(input.paidInvoices, weekStart),
    recoveredThisMonth: sumPaidSince(input.paidInvoices, monthStart),
    averageDaysToPayment: computeAverageDaysToPayment(input.paidInvoices),
    collectionRatePercent: computeCollectionRatePercent(input.paidCountAllTime, input.manuallyResolvedCountAllTime),
  }
}
