import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"
import { daysBetween, formatCents } from "@/lib/dashboard/format"

export type AttentionSeverity = "red" | "orange"

export interface AttentionItem {
  id: string
  severity: AttentionSeverity
  message: string
  href: string
}

const LONG_OVERDUE_DAYS_THRESHOLD = 45
const PROMISE_EXPIRES_SOON_HOURS = 24
const UNUSUAL_AMOUNT_MULTIPLIER = 1.5
const MIN_PAID_HISTORY_FOR_UNUSUAL_AMOUNT = 2

/**
 * Builds the "Attention Required" list — the highest-signal, most
 * actionable items on the dashboard. Every rule is derived from data
 * already on hand (no fabricated/placeholder items):
 *  - long overdue invoices
 *  - invoices that exhausted all 3 reminders with no promise to pay
 *  - promises to pay expiring within 24h
 *  - an invoice unusually large vs. that debtor's own paid-invoice history
 */
export function buildAttentionItems(input: {
  activeInvoices: InvoiceWithRelations[]
  paidInvoices: Pick<PaidInvoiceSummary, "clientEmail" | "amountDue">[]
  now?: Date
  limit?: number
}): AttentionItem[] {
  const now = input.now ?? new Date()
  const limit = input.limit ?? 6

  const paidHistoryByDebtor = new Map<string, { sum: number; count: number }>()
  for (const paid of input.paidInvoices) {
    const key = paid.clientEmail.toLowerCase()
    const existing = paidHistoryByDebtor.get(key)
    if (existing) {
      existing.sum += paid.amountDue
      existing.count += 1
    } else {
      paidHistoryByDebtor.set(key, { sum: paid.amountDue, count: 1 })
    }
  }

  const items: AttentionItem[] = []

  for (const invoice of input.activeInvoices) {
    const overdue = daysBetween(new Date(invoice.dueDate), now)
    const amount = formatCents(invoice.amountDue, invoice.currency)

    if (overdue >= LONG_OVERDUE_DAYS_THRESHOLD) {
      items.push({
        id: `${invoice.id}-overdue`,
        severity: "red",
        message: `${invoice.clientName}'s invoice for ${amount} is now ${overdue} days overdue`,
        href: "/dashboard/invoices?filter=overdue",
      })
    }

    const hasActivePromise = invoice.promisesToPay.some((promise) => promise.status === "active")
    if (invoice.currentStage >= 3 && !hasActivePromise) {
      items.push({
        id: `${invoice.id}-ignored`,
        severity: "orange",
        message: `${invoice.clientName} has ignored all 3 reminders for ${amount}`,
        href: "/dashboard/invoices?filter=overdue",
      })
    }

    for (const promise of invoice.promisesToPay) {
      if (promise.status !== "active") continue
      const hoursUntilDue = (new Date(promise.promisedPayBy).getTime() - now.getTime()) / (1000 * 60 * 60)
      if (hoursUntilDue > 0 && hoursUntilDue <= PROMISE_EXPIRES_SOON_HOURS) {
        items.push({
          id: `${invoice.id}-promise-expiring`,
          severity: "orange",
          message: `${invoice.clientName}'s promise to pay ${amount} expires within 24 hours`,
          href: "/dashboard/invoices",
        })
      }
    }

    const history = paidHistoryByDebtor.get(invoice.clientEmail.toLowerCase())
    if (history && history.count >= MIN_PAID_HISTORY_FOR_UNUSUAL_AMOUNT) {
      const averagePaid = history.sum / history.count
      if (invoice.amountDue > averagePaid * UNUSUAL_AMOUNT_MULTIPLIER) {
        items.push({
          id: `${invoice.id}-unusual-amount`,
          severity: "red",
          message: `${invoice.clientName}'s invoice of ${amount} is unusually large vs. their usual ${formatCents(averagePaid, invoice.currency)}`,
          href: "/dashboard/invoices",
        })
      }
    }
  }

  const severityRank: Record<AttentionSeverity, number> = { red: 0, orange: 1 }
  return items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]).slice(0, limit)
}
