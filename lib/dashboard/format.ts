/**
 * Shared formatting helpers for the new business-KPI dashboard widgets
 * (Top KPI cards, Cash Waiting, Ageing chart, Recent Payments, etc.).
 * `amountDue`/sums are always cents (integers) per repo convention.
 */

export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function formatShortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

/** Midnight UTC for `date` — matches the ms-floor day-counting convention already used in lib/email/templates.ts. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}
