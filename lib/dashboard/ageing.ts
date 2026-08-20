import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import { daysBetween } from "@/lib/dashboard/format"
import { computeOutstanding, type LedgerPayment } from "@/lib/invoices/payments"

export type AgeingBucketKey = "current" | "d1to30" | "d31to60" | "d61to90" | "d90plus"

export interface AgeingBucket {
  key: AgeingBucketKey
  label: string
  count: number
  /** cents */
  amount: number
}

const AGEING_BUCKET_LABELS: Record<AgeingBucketKey, string> = {
  current: "Current",
  d1to30: "1–30 days",
  d31to60: "31–60 days",
  d61to90: "61–90 days",
  d90plus: "90+ days",
}

function bucketFor(daysOverdue: number): AgeingBucketKey {
  if (daysOverdue <= 0) return "current"
  if (daysOverdue <= 30) return "d1to30"
  if (daysOverdue <= 60) return "d31to60"
  if (daysOverdue <= 90) return "d61to90"
  return "d90plus"
}

/**
 * Buckets every active (unpaid, unresolved) invoice by days-overdue-as-of
 * `now`. Feeds both the "Cash Waiting to Be Collected" summary and the
 * Ageing bar chart, so the two always agree with each other.
 */
export function buildAgeingBuckets(
  invoices: (Pick<InvoiceWithRelations, "amountDue" | "dueDate"> & { payments: LedgerPayment[] })[],
  now: Date = new Date(),
): AgeingBucket[] {
  const totals: Record<AgeingBucketKey, { count: number; amount: number }> = {
    current: { count: 0, amount: 0 },
    d1to30: { count: 0, amount: 0 },
    d31to60: { count: 0, amount: 0 },
    d61to90: { count: 0, amount: 0 },
    d90plus: { count: 0, amount: 0 },
  }

  for (const invoice of invoices) {
    const overdue = daysBetween(new Date(invoice.dueDate), now)
    const bucket = totals[bucketFor(overdue)]
    bucket.count += 1
    bucket.amount += computeOutstanding(invoice, invoice.payments)
  }

  return (Object.keys(totals) as AgeingBucketKey[]).map((key) => ({
    key,
    label: AGEING_BUCKET_LABELS[key],
    ...totals[key],
  }))
}

export interface CashWaitingSummary {
  /** cents */
  outstanding: number
  current: number
  d1to30: number
  d31to60: number
  d60plus: number
}

/** Collapses the 5 ageing buckets into the 4-row "Cash Waiting" summary (61–90 and 90+ merge into "60+"). */
export function buildCashWaitingSummary(buckets: AgeingBucket[]): CashWaitingSummary {
  const byKey = Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket.amount])) as Record<
    AgeingBucketKey,
    number
  >
  return {
    outstanding: buckets.reduce((sum, bucket) => sum + bucket.amount, 0),
    current: byKey.current ?? 0,
    d1to30: byKey.d1to30 ?? 0,
    d31to60: byKey.d31to60 ?? 0,
    d60plus: (byKey.d61to90 ?? 0) + (byKey.d90plus ?? 0),
  }
}
