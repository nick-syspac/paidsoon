import { withUserContext } from "@/lib/db/withUserContext"
import { traceOperation } from "@/lib/diagnostics/server"
import type { TraceContext } from "@/lib/diagnostics/shared"
import type { ArrangementCoverageWithArrangement } from "@/lib/dashboard/arrangements"
import type { EmailLog, PromiseToPay, TrackedInvoice } from "@/lib/generated/prisma/client"

/** 'pending' | 'paused' | 'snoozed' | 'sequence_complete' — invoices still in an active chase. */
export const ACTIVE_INVOICE_STATUSES = ["pending", "paused", "snoozed", "sequence_complete"]
/** 'paid' | 'manually_resolved' — invoices no longer being chased. */
export const RESOLVED_INVOICE_STATUSES = ["paid", "manually_resolved"]

export type InvoiceWithRelations = TrackedInvoice & {
  emailLogs: EmailLog[]
  promisesToPay: PromiseToPay[]
  arrangementCoverages: ArrangementCoverageWithArrangement[]
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
    () =>
      withUserContext(userId, (tx) =>
        tx.trackedInvoice.findMany({
          where: {
            userId,
            status: { in: statuses },
          },
          orderBy,
          include: {
            emailLogs: { orderBy: { sentAt: "asc" } },
            promisesToPay: {
              orderBy: { createdAt: "desc" },
            },
            arrangementCoverages: {
              orderBy: { createdAt: "desc" },
              include: {
                arrangement: {
                  include: {
                    coverages: { select: { trackedInvoiceId: true } },
                  },
                },
              },
            },
          },
        }),
      ),
    { success: (result) => ({ outputs: { invoiceCount: result.length } }) },
  )
}
