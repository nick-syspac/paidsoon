import { withUserContext } from "@/lib/db/withUserContext"
import { traceOperation } from "@/lib/diagnostics/server"
import type { TraceContext } from "@/lib/diagnostics/shared"
import { buildBrokenPromiseCountsByDebtor } from "@/lib/promiseEscalationPolicy"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"

/**
 * Loads the count of broken promises-to-pay per debtor (keyed by lowercased
 * client email), shared by Overview (severity), Invoices, and Resolved
 * Invoices tables (openspec/changes/add-dashboard-overview).
 */
export async function loadBrokenPromiseCountsByDebtor(
  userId: string,
  traceContext: TraceContext,
  component: string,
): Promise<Record<string, number>> {
  return traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.load_broken_promises",
      operation: "withUserContext.promiseToPay.findMany",
      subsystem: "dashboard",
      component,
      tenant: { context: "user_rls" },
    },
    () =>
      withUserContext(userId, async (tx) => {
        const rows = await tx.promiseToPay.findMany({
          where: { userId, status: "broken" },
          select: {
            trackedInvoice: { select: { clientEmail: true } },
          },
        })

        return buildBrokenPromiseCountsByDebtor(
          rows.map((row) => ({ clientEmail: row.trackedInvoice.clientEmail })),
        )
      }),
    { success: (result) => ({ outputs: { debtorCount: Object.keys(result).length } }) },
  )
}

/**
 * Loads the promise-escalation threshold, falling back to the shared
 * default (2) when the user has no policy row yet.
 */
export async function loadEscalationThreshold(
  userId: string,
  traceContext: TraceContext,
  component: string,
): Promise<number> {
  const policy = await traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.load_promise_policy",
      operation: "withUserContext.promiseEscalationPolicy.findUnique",
      subsystem: "dashboard",
      component,
      tenant: { context: "user_rls" },
    },
    () =>
      withUserContext(userId, (tx) =>
        tx.promiseEscalationPolicy.findUnique({
          where: { userId },
          select: { escalationThreshold: true },
        }),
      ),
    {
      success: (result) => ({
        outputs: { policyPresent: Boolean(result), escalationThreshold: result?.escalationThreshold ?? null },
      }),
    },
  )
  return policy?.escalationThreshold ?? 2
}

/**
 * An invoice is "held" when it is due for its first reminder but the account
 * has no remaining chase-volume allowance this period — visible on the
 * dashboard, not discarded, and picked up automatically once the period
 * rolls over (see openspec/changes/monthly-chase-volume-limits).
 */
export function computeHeldInvoiceIds(
  invoices: InvoiceWithRelations[],
  atCapacity: boolean,
): Set<string> {
  if (!atCapacity) return new Set()
  return new Set(
    invoices
      .filter(
        (invoice) =>
          invoice.status === "pending" &&
          invoice.currentStage === 0 &&
          invoice.nextEmailAt !== null &&
          invoice.nextEmailAt <= new Date(),
      )
      .map((invoice) => invoice.id),
  )
}
