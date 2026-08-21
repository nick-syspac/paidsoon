import type { PrismaTx } from "@/lib/db/withUserContext"

/**
 * Counts invoices flagged `disputed` for this tenant.
 */
export async function loadDisputedInvoiceCountWithTx(tx: PrismaTx, userId: string): Promise<number> {
  return tx.trackedInvoice.count({ where: { userId, status: "disputed" } })
}

/**
 * Counts customers with no usable contact email. Always 0 today —
 * `findOrCreateCustomer` (lib/db/customers.ts) never persists an empty
 * `primaryEmail` — but becomes real once a future import path allows one.
 */
export async function loadNoContactEmailCustomerCountWithTx(tx: PrismaTx, userId: string): Promise<number> {
  return tx.customer.count({ where: { userId, primaryEmail: "" } })
}

/**
 * TODO(add-invoice-payment-ledger): reconciliation anomalies aren't
 * persisted anywhere yet — that change hasn't added its anomaly flag to the
 * schema. Hardcoded to 0 until that field exists to query.
 */
export function loadImportAnomalyCount(): number {
  return 0
}
