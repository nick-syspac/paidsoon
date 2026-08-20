import { withUserContext } from "@/lib/db/withUserContext"
import type { PrismaTx } from "@/lib/db/withUserContext"
import { traceOperation } from "@/lib/diagnostics/server"
import type { TraceContext } from "@/lib/diagnostics/shared"
import type { ArrangementCoverageWithArrangement } from "@/lib/dashboard/arrangements"
import type { EmailLog, InvoicePayment, PromiseToPay, TrackedInvoice } from "@/lib/generated/prisma/client"

/** 'pending' | 'paused' | 'snoozed' | 'sequence_complete' — invoices still in an active chase. */
export const ACTIVE_INVOICE_STATUSES = ["pending", "paused", "snoozed", "sequence_complete"]
/** 'paid' | 'manually_resolved' — invoices no longer being chased. */
export const RESOLVED_INVOICE_STATUSES = ["paid", "manually_resolved"]

export type InvoiceWithRelations = TrackedInvoice & {
  emailLogs: EmailLog[]
  promisesToPay: PromiseToPay[]
  arrangementCoverages: ArrangementCoverageWithArrangement[]
  payments: InvoicePayment[]
}

function groupByTrackedInvoiceId<T extends { trackedInvoiceId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const existing = grouped.get(row.trackedInvoiceId)
    if (existing) existing.push(row)
    else grouped.set(row.trackedInvoiceId, [row])
  }
  return grouped
}

export async function loadDashboardInvoicesWithTx(
  tx: PrismaTx,
  userId: string,
  statuses: string[],
  orderBy: { updatedAt: "desc" } | { nextEmailAt: "asc" },
): Promise<InvoiceWithRelations[]> {
  const invoices = await tx.trackedInvoice.findMany({
    where: {
      userId,
      status: { in: statuses },
    },
    orderBy,
  })
  if (invoices.length === 0) return []

  const invoiceIds = invoices.map((invoice) => invoice.id)
  const emailLogs = await tx.emailLog.findMany({
    where: { trackedInvoiceId: { in: invoiceIds } },
    orderBy: { sentAt: "asc" },
  })
  const promisesToPay = await tx.promiseToPay.findMany({
    where: { userId, trackedInvoiceId: { in: invoiceIds } },
    orderBy: { createdAt: "desc" },
  })
  const arrangementCoverages = await tx.arrangementInvoiceCoverage.findMany({
    where: { userId, trackedInvoiceId: { in: invoiceIds } },
    orderBy: { createdAt: "desc" },
  })
  const payments = await tx.invoicePayment.findMany({
    where: { userId, trackedInvoiceId: { in: invoiceIds } },
    orderBy: { recordedAt: "asc" },
  })

  const arrangementIds = [...new Set(arrangementCoverages.map((coverage) => coverage.arrangementId))]
  const arrangements = arrangementIds.length
    ? await tx.arrangement.findMany({ where: { userId, id: { in: arrangementIds } } })
    : []
  const arrangementScopes = arrangementIds.length
    ? await tx.arrangementInvoiceCoverage.findMany({
        where: { userId, arrangementId: { in: arrangementIds } },
        select: { arrangementId: true, trackedInvoiceId: true },
      })
    : []
  const paymentsByInvoice = groupByTrackedInvoiceId(payments)

  const emailLogsByInvoice = groupByTrackedInvoiceId(emailLogs)
  const promisesByInvoice = groupByTrackedInvoiceId(promisesToPay)
  const coveragesByInvoice = groupByTrackedInvoiceId(arrangementCoverages)
  const scopeByArrangement = new Map<string, Pick<(typeof arrangementScopes)[number], "trackedInvoiceId">[]>()
  for (const scope of arrangementScopes) {
    const existing = scopeByArrangement.get(scope.arrangementId)
    const coverage = { trackedInvoiceId: scope.trackedInvoiceId }
    if (existing) existing.push(coverage)
    else scopeByArrangement.set(scope.arrangementId, [coverage])
  }
  const arrangementsById = new Map(
    arrangements.map((arrangement) => [
      arrangement.id,
      { ...arrangement, coverages: scopeByArrangement.get(arrangement.id) ?? [] },
    ]),
  )

  return invoices.map((invoice) => ({
    ...invoice,
    emailLogs: emailLogsByInvoice.get(invoice.id) ?? [],
    promisesToPay: promisesByInvoice.get(invoice.id) ?? [],
    arrangementCoverages: (coveragesByInvoice.get(invoice.id) ?? []).flatMap((coverage) => {
      const arrangement = arrangementsById.get(coverage.arrangementId)
      return arrangement ? [{ ...coverage, arrangement }] : []
    }),
    payments: paymentsByInvoice.get(invoice.id) ?? [],
  }))
}

/**
 * Loads tracked invoices for one of the two dashboard status buckets (active
 * or resolved), with the same relation shape `InvoiceTable` needs. Shared by
 * `/dashboard` (Overview, for severity derivation), `/dashboard/invoices`, and
 * `/dashboard/resolved` (openspec/changes/add-dashboard-overview).
 */
export async function loadDashboardInvoices(
  userId: string,
  statuses: string[],
  orderBy: { updatedAt: "desc" } | { nextEmailAt: "asc" },
  traceContext: TraceContext,
  component: string,
): Promise<InvoiceWithRelations[]> {
  return traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.load_invoices",
      operation: "withUserContext.trackedInvoice.findMany",
      subsystem: "dashboard",
      component,
      tenant: { context: "user_rls" },
      inputs: { statuses },
    },
    () => withUserContext(userId, (tx) => loadDashboardInvoicesWithTx(tx, userId, statuses, orderBy)),
    { success: (result) => ({ outputs: { invoiceCount: result.length } }) },
  )
}
