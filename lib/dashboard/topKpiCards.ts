import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"
import { buildAgeingBuckets } from "@/lib/dashboard/ageing"
import { computeAverageDaysToPayment, computeCollectionRatePercent, sumPaidSince } from "@/lib/dashboard/collectionMetrics"
import { formatCents } from "@/lib/dashboard/format"

export interface TopKpiCard {
  id: "outstanding" | "overdue" | "collected_this_month" | "avg_days_to_payment" | "collection_rate"
  icon: string
  label: string
  value: string
  detail?: string
  href: string
}

/**
 * The 5 headline "Top KPI Cards". Built from data the dashboard already
 * loads (`activeInvoices`) plus the new `loadDashboardMetrics` result — no
 * additional queries.
 */
export function buildTopKpiCards(input: {
  activeInvoices: Pick<InvoiceWithRelations, "amountDue" | "dueDate" | "currency">[]
  paidInvoices: PaidInvoiceSummary[]
  paidCountAllTime: number
  manuallyResolvedCountAllTime: number
  now?: Date
}): TopKpiCard[] {
  const now = input.now ?? new Date()
  const currency = input.activeInvoices[0]?.currency ?? input.paidInvoices[0]?.currency ?? "usd"

  const outstandingTotal = input.activeInvoices.reduce((sum, invoice) => sum + invoice.amountDue, 0)
  const buckets = buildAgeingBuckets(input.activeInvoices, now)
  const overdueTotal = buckets.filter((b) => b.key !== "current").reduce((sum, b) => sum + b.amount, 0)
  const overdueCount = buckets.filter((b) => b.key !== "current").reduce((sum, b) => sum + b.count, 0)

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const collectedThisMonth = sumPaidSince(input.paidInvoices, monthStart)

  const avgDaysToPayment = computeAverageDaysToPayment(input.paidInvoices)
  const collectionRatePercent = computeCollectionRatePercent(
    input.paidCountAllTime,
    input.manuallyResolvedCountAllTime,
  )

  return [
    {
      id: "outstanding",
      icon: "💰",
      label: "Outstanding invoices",
      value: formatCents(outstandingTotal, currency),
      detail: `${input.activeInvoices.length} invoice${input.activeInvoices.length === 1 ? "" : "s"}`,
      href: "/dashboard/invoices",
    },
    {
      id: "overdue",
      icon: "🔴",
      label: "Overdue invoices",
      value: formatCents(overdueTotal, currency),
      detail: `${overdueCount} invoice${overdueCount === 1 ? "" : "s"}`,
      href: "/dashboard/invoices?filter=overdue",
    },
    {
      id: "collected_this_month",
      icon: "💵",
      label: "Money collected this month",
      value: formatCents(collectedThisMonth, currency),
      href: "/dashboard/resolved",
    },
    {
      id: "avg_days_to_payment",
      icon: "📈",
      label: "Average days to payment",
      value: avgDaysToPayment != null ? `${avgDaysToPayment} days` : "—",
      detail: avgDaysToPayment != null ? "From invoice date to payment" : "No payments yet",
      href: "/dashboard/resolved",
    },
    {
      id: "collection_rate",
      icon: "🟢",
      label: "Collection success rate",
      value: collectionRatePercent != null ? `${collectionRatePercent}%` : "—",
      detail: collectionRatePercent != null ? "Of invoices resolved, paid vs. written off" : "No resolved invoices yet",
      href: "/dashboard/resolved",
    },
  ]
}
