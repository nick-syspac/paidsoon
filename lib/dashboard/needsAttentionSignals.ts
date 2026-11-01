import type { PrismaTx } from "@/lib/db/withUserContext"

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

/**
 * Counts invoices flagged `disputed` for this tenant.
 */
export async function loadDisputedInvoiceCountWithTx(
  tx: PrismaTx,
  userId: string,
  cutoffDate: Date | null = null,
): Promise<number> {
  if (!cutoffDate) {
    return tx.trackedInvoice.count({ where: { userId, status: "disputed" } })
  }

  const rows = await tx.trackedInvoice.findMany({
    where: { userId, status: "disputed" },
    select: { financialInvoice: { select: { issueDate: true, dueDate: true } } },
  })

  return rows.filter((row) => invoiceMatchesAccountCutoff(row.financialInvoice, cutoffDate)).length
}

/**
 * Counts customers with no usable contact email. Always 0 today —
 * `findOrCreateCustomer` (lib/db/customers.ts) never persists an empty
 * `primaryEmail` — but becomes real once a future import path allows one.
 */
export async function loadNoContactEmailCustomerCountWithTx(tx: PrismaTx, userId: string): Promise<number> {
  // Canonical contacts always carry a non-empty email when created via
  // findOrCreateCustomer; count any whose linked contact lost its email.
  return tx.customer.count({ where: { userId, financialContact: { email: null } } })
}

/**
 * TODO(add-invoice-payment-ledger): reconciliation anomalies aren't
 * persisted anywhere yet — that change hasn't added its anomaly flag to the
 * schema. Hardcoded to 0 until that field exists to query.
 */
export function loadImportAnomalyCount(): number {
  return 0
}
