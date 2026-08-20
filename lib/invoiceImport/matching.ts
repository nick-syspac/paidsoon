import type { InvoiceImportCanonicalField } from "@/lib/invoiceImport/template"
import type { InvoiceImportIssue } from "@/lib/invoiceImport/mapping"

/**
 * Shared provider tag for spreadsheet-imported invoices, used as the
 * TrackedInvoice/InvoiceConnection `provider` value so imports never collide
 * with live Stripe/Xero/MYOB-sourced records under the
 * (externalId, provider, userId) idempotency key.
 */
export const INVOICE_IMPORT_PROVIDER = "spreadsheet_import"

export type InvoiceImportDuplicateMode = "skip_existing" | "update_eligible"

export function isInvoiceImportDuplicateMode(value: string): value is InvoiceImportDuplicateMode {
  return value === "skip_existing" || value === "update_eligible"
}

/** TrackedInvoice statuses that must never be reopened by an import update. */
export const TERMINAL_TRACKED_INVOICE_STATUSES = new Set(["paid", "manually_resolved"])

export type InvoiceImportMatchableRow = {
  rowNumber: number
  values: Partial<Record<InvoiceImportCanonicalField, string>>
}

/**
 * Resolves the identifier used to match this row against an existing
 * TrackedInvoice: `invoice_external_id` when present, otherwise
 * `invoice_number`. Mirrors the matching precedence documented in
 * openspec/changes/add-csv-xlsx-invoice-import/design.md.
 */
export function resolveInvoiceImportExternalId(
  values: Partial<Record<InvoiceImportCanonicalField, string>>,
): string | null {
  const externalId = values.invoice_external_id?.trim()
  if (externalId) return externalId
  const invoiceNumber = values.invoice_number?.trim()
  return invoiceNumber ? invoiceNumber : null
}

/**
 * Flags every row whose `customer_external_id` is linked to more than one
 * distinct `customer_email` within the same batch — an ambiguous identity
 * that must block commit rather than silently pick one customer.
 */
export function detectInvoiceImportCustomerConflicts(
  rows: InvoiceImportMatchableRow[],
): InvoiceImportIssue[] {
  const emailsByExternalId = new Map<string, Set<string>>()

  for (const row of rows) {
    const externalId = row.values.customer_external_id?.trim()
    const email = row.values.customer_email?.trim().toLowerCase()
    if (!externalId || !email) continue

    const emails = emailsByExternalId.get(externalId) ?? new Set<string>()
    emails.add(email)
    emailsByExternalId.set(externalId, emails)
  }

  const conflictingExternalIds = new Set(
    [...emailsByExternalId.entries()]
      .filter(([, emails]) => emails.size > 1)
      .map(([externalId]) => externalId),
  )

  if (conflictingExternalIds.size === 0) return []

  const issues: InvoiceImportIssue[] = []
  for (const row of rows) {
    const externalId = row.values.customer_external_id?.trim()
    if (externalId && conflictingExternalIds.has(externalId)) {
      issues.push({
        rowNumber: row.rowNumber,
        field: "customer_external_id",
        severity: "error",
        code: "customer_external_id_conflict",
        message: `Customer external ID ${externalId} is linked to more than one customer email in this batch.`,
      })
    }
  }
  return issues
}

/**
 * Flags rows that resolve to the same invoice identifier
 * (`invoice_external_id`, falling back to `invoice_number`) within the same
 * batch, so the ambiguity is surfaced instead of silently matching one row.
 */
export function detectInvoiceImportDuplicateIdentifiers(
  rows: InvoiceImportMatchableRow[],
): InvoiceImportIssue[] {
  const rowsByIdentifier = new Map<string, InvoiceImportMatchableRow[]>()

  for (const row of rows) {
    const identifier = resolveInvoiceImportExternalId(row.values)
    if (!identifier) continue
    const bucket = rowsByIdentifier.get(identifier) ?? []
    bucket.push(row)
    rowsByIdentifier.set(identifier, bucket)
  }

  const issues: InvoiceImportIssue[] = []
  for (const [identifier, bucket] of rowsByIdentifier) {
    if (bucket.length < 2) continue
    for (const row of bucket) {
      issues.push({
        rowNumber: row.rowNumber,
        field: row.values.invoice_external_id?.trim() ? "invoice_external_id" : "invoice_number",
        severity: "error",
        code: "duplicate_invoice_identifier",
        message: `Invoice identifier ${identifier} appears on more than one row in this batch.`,
      })
    }
  }
  return issues
}
