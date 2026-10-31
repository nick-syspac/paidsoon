import { withUserContext } from "@/lib/db/withUserContext"
import type { PrismaTx } from "@/lib/db/withUserContext"
import { traceOperation } from "@/lib/diagnostics/server"
import type { TraceContext } from "@/lib/diagnostics/shared"
import { buildBrokenPromiseCountsByDebtor } from "@/lib/promiseEscalationPolicy"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"

function dateOnlyKey(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const asDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(asDate.getTime())) return null
  return asDate.toISOString().slice(0, 10)
}

function invoiceMatchesAccountCutoff(
  invoice: { issueDate?: Date | null; dueDate?: Date | null } | null,
  cutoffDate: Date | null,
): boolean {
  if (!cutoffDate) return true
  const effectiveDate = invoice?.issueDate ?? invoice?.dueDate ?? null
  if (!effectiveDate) return false

  const cutoffKey = dateOnlyKey(cutoffDate)
  const invoiceKey = dateOnlyKey(effectiveDate)
  if (!cutoffKey || !invoiceKey) return false

  return invoiceKey >= cutoffKey
}

export async function loadBrokenPromiseCountsByDebtorWithTx(
  tx: PrismaTx,
  userId: string,
  cutoffDate: Date | null = null,
): Promise<Record<string, number>> {
  const rows = await tx.promiseToPay.findMany({
    where: { userId, status: "broken" },
    select: {
      trackedInvoice: {
        select: {
          financialInvoice: {
            select: {
              contact: { select: { email: true } },
              issueDate: true,
              dueDate: true,
            },
          },
        },
      },
    },
  })

  const eligibleRecords = rows.filter((row) =>
    invoiceMatchesAccountCutoff(row.trackedInvoice.financialInvoice, cutoffDate),
  )

  return buildBrokenPromiseCountsByDebtor(
    eligibleRecords.map((row) => ({ clientEmail: row.trackedInvoice.financialInvoice.contact?.email ?? "" })),
  )
}

export async function loadEscalationThresholdWithTx(
  tx: PrismaTx,
  userId: string,
): Promise<number> {
  const policy = await tx.promiseEscalationPolicy.findUnique({
    where: { userId },
    select: { escalationThreshold: true },
  })
  return policy?.escalationThreshold ?? 2
}

/**
 * Loads the count of broken promises-to-pay per debtor (keyed by lowercased
 * client email), shared by Overview (severity), Invoices, and Resolved
 * Invoices tables (openspec/changes/add-dashboard-overview).
 */
export async function loadBrokenPromiseCountsByDebtor(
  userId: string,
  traceContext: TraceContext,
  component: string,
  cutoffDate: Date | null = null,
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
    () => withUserContext(userId, (tx) => loadBrokenPromiseCountsByDebtorWithTx(tx, userId, cutoffDate)),
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
    () => withUserContext(userId, (tx) => tx.promiseEscalationPolicy.findUnique({
      where: { userId },
      select: { escalationThreshold: true },
    })),
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
  now: Date = new Date(),
): Set<string> {
  if (!atCapacity) return new Set()
  return new Set(
    invoices
      .filter(
        (invoice) =>
          invoice.status === "pending" &&
          invoice.currentStage === 0 &&
          invoice.nextEmailAt !== null &&
          invoice.nextEmailAt <= now,
      )
      .map((invoice) => invoice.id),
  )
}
