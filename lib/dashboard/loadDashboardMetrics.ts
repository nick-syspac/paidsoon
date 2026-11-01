import { withUserContext } from "@/lib/db/withUserContext"
import type { PrismaTx } from "@/lib/db/withUserContext"
import { traceOperation } from "@/lib/diagnostics/server"
import type { TraceContext } from "@/lib/diagnostics/shared"

/**
 * Paid invoices are loaded for a rolling window, not all-time, to bound
 * query size for the "recent payments" list, weekly/monthly collection
 * totals, and the payment-trend chart. `paidCountAllTime` is a separate
 * cheap count so the collection-rate KPI isn't skewed by the window.
 */
const PAID_INVOICE_LOOKBACK_DAYS = 180

export interface PaidInvoiceSummary {
  id: string
  clientEmail: string
  clientName: string
  /** cents */
  amountDue: number
  currency: string
  createdAt: Date
  /** No dedicated `paidAt` column exists yet — `updatedAt` is used as a proxy
   * since `status` only flips to "paid" once, in `handleInvoicePaid`
   * (app/api/webhooks/stripe-connect/route.ts), and paid invoices are not
   * otherwise mutated. */
  updatedAt: Date
}

export interface DashboardMetricsContext {
  paidInvoices: PaidInvoiceSummary[]
  paidCountAllTime: number
  manuallyResolvedCountAllTime: number
  remindersSentToday: number
}

function dateOnlyKey(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const asDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(asDate.getTime())) return null
  return asDate.toISOString().slice(0, 10)
}

function invoiceMatchesAccountCutoff(
  invoice: { issueDate?: Date | null; dueDate?: Date | null; financialInvoice?: { issueDate?: Date | null; dueDate?: Date | null } | null } | null,
  cutoffDate: Date | null,
): boolean {
  if (!cutoffDate) return true
  const effectiveDate = invoice?.financialInvoice?.issueDate ?? invoice?.financialInvoice?.dueDate ?? invoice?.issueDate ?? invoice?.dueDate ?? null
  if (!effectiveDate) return false
  const cutoffKey = dateOnlyKey(cutoffDate)
  const invoiceKey = dateOnlyKey(effectiveDate)
  if (!cutoffKey || !invoiceKey) return false
  return invoiceKey >= cutoffKey
}

export async function loadDashboardMetricsWithTx(
  tx: PrismaTx,
  userId: string,
  now: Date = new Date(),
  cutoffDate: Date | null = null,
): Promise<DashboardMetricsContext> {
  const since = new Date(now)
  since.setUTCDate(since.getUTCDate() - PAID_INVOICE_LOOKBACK_DAYS)
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)

  const paidRows = await tx.trackedInvoice.findMany({
    where: { userId, status: "paid", updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      financialInvoice: {
        select: {
          amountDueCents: true,
          currency: true,
          issueDate: true,
          dueDate: true,
          contact: { select: { name: true, email: true } },
        },
      },
    },
  })
  const paidInvoices: PaidInvoiceSummary[] = paidRows.flatMap((row) => {
    if (!row.financialInvoice) return []

    // Period cash receipts are keyed by payment date, not invoice eligibility.
    // An older invoice can still produce a qualifying later collection while the
    // invoice remains hidden behind the account display cutoff. The collection
    // widgets and recent-payments list should reflect the receipt event itself;
    // the invoice-status KPI counts remain filter-aware below.
    return [{
      id: row.id,
      clientEmail: row.financialInvoice.contact?.email ?? "",
      clientName: row.financialInvoice.contact?.name ?? "",
      amountDue: row.financialInvoice.amountDueCents,
      currency: row.financialInvoice.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }]
  })
  if (paidInvoices.length !== paidRows.length) {
    console.error("Skipping paid invoices missing financial invoice relation", {
      missingCount: paidRows.length - paidInvoices.length,
      trackedInvoiceIds: paidRows
        .filter((row) => !row.financialInvoice)
        .map((row) => row.id),
    })
  }

  const statusRows = await tx.trackedInvoice.findMany({
    where: { userId, status: { in: ["paid", "manually_resolved"] } },
    select: {
      id: true,
      status: true,
      financialInvoice: {
        select: {
          issueDate: true,
          dueDate: true,
        },
      },
    },
  })
  const paidCountAllTime = statusRows.filter(
    (row) => row.status === "paid" && row.financialInvoice && invoiceMatchesAccountCutoff(row.financialInvoice, cutoffDate),
  ).length
  const manuallyResolvedCountAllTime = statusRows.filter(
    (row) => row.status === "manually_resolved" && row.financialInvoice && invoiceMatchesAccountCutoff(row.financialInvoice, cutoffDate),
  ).length
  const remindersSentToday = await tx.emailLog.count({
    where: { sentAt: { gte: todayStart }, trackedInvoice: { userId } },
  })

  return { paidInvoices, paidCountAllTime, manuallyResolvedCountAllTime, remindersSentToday }
}

/**
 * Loads the additional data the new business-KPI dashboard widgets need
 * beyond what `loadDashboardInvoices`/`loadDashboardContext` already fetch:
 * recently paid invoices (money collected, recent payments, collection
 * performance, payment trend) and today's reminder-send count.
 */
export async function loadDashboardMetrics(
  userId: string,
  traceContext: TraceContext,
  component: string,
  cutoffDate: Date | null = null,
): Promise<DashboardMetricsContext> {
  return traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.load_metrics",
      operation: "withUserContext.dashboardMetrics",
      subsystem: "dashboard",
      component,
      tenant: { context: "user_rls" },
    },
    () => withUserContext(userId, (tx) => loadDashboardMetricsWithTx(tx, userId, new Date(), cutoffDate)),
    {
      success: (result) => ({
        outputs: {
          paidInvoiceCount: result.paidInvoices.length,
          paidCountAllTime: result.paidCountAllTime,
          remindersSentToday: result.remindersSentToday,
        },
      }),
    },
  )
}
