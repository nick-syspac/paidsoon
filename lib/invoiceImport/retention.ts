// Retention policy for spreadsheet-import batches (openspec change
// add-csv-xlsx-invoice-import, requirement "Tenant-safe import lifecycle"):
// raw upload content (staging rows) is deleted no later than 24 hours after
// a batch reaches a terminal state, or after a longer inactivity window if
// the batch is abandoned before it ever reaches one. Batch metadata itself
// (fileName, counts, status, timestamps) is kept for audit history.

export const INVOICE_IMPORT_TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const

export const INVOICE_IMPORT_TERMINAL_CLEANUP_HOURS = 24
export const INVOICE_IMPORT_ABANDONED_HOURS = 24 * 7

export type InvoiceImportBatchForRetention = {
  id: string
  status: string
  completedAt: Date | null
  updatedAt: Date
}

export type InvoiceImportRetentionAction =
  | { batchId: string; action: "purge_staging" }
  | { batchId: string; action: "mark_abandoned_and_purge" }

function isTerminalStatus(status: string): boolean {
  return (INVOICE_IMPORT_TERMINAL_STATUSES as readonly string[]).includes(status)
}

function hoursSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / (60 * 60 * 1000)
}

/** Pure decision logic, kept separate from the cron route so it can be unit tested without a database. */
export function planInvoiceImportRetention(
  batches: InvoiceImportBatchForRetention[],
  now: Date,
): InvoiceImportRetentionAction[] {
  const actions: InvoiceImportRetentionAction[] = []

  for (const batch of batches) {
    if (isTerminalStatus(batch.status)) {
      const terminalAt = batch.completedAt ?? batch.updatedAt
      if (hoursSince(terminalAt, now) >= INVOICE_IMPORT_TERMINAL_CLEANUP_HOURS) {
        actions.push({ batchId: batch.id, action: "purge_staging" })
      }
      continue
    }

    if (hoursSince(batch.updatedAt, now) >= INVOICE_IMPORT_ABANDONED_HOURS) {
      actions.push({ batchId: batch.id, action: "mark_abandoned_and_purge" })
    }
  }

  return actions
}
