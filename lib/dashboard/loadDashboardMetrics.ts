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

export async function loadDashboardMetricsWithTx(
  tx: PrismaTx,
  userId: string,
  now: Date = new Date(),
): Promise<DashboardMetricsContext> {
  const since = new Date(now)
  since.setUTCDate(since.getUTCDate() - PAID_INVOICE_LOOKBACK_DAYS)
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)

  const paidInvoices = await tx.trackedInvoice.findMany({
    where: { userId, status: "paid", updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      clientEmail: true,
      clientName: true,
      amountDue: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  const paidCountAllTime = await tx.trackedInvoice.count({ where: { userId, status: "paid" } })
  const manuallyResolvedCountAllTime = await tx.trackedInvoice.count({
    where: { userId, status: "manually_resolved" },
  })
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
    () => withUserContext(userId, (tx) => loadDashboardMetricsWithTx(tx, userId)),
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
