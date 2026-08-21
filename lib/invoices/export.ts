import * as XLSX from "xlsx"

import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import { STAGE_LABELS, STATUS_LABELS } from "@/lib/dashboard/invoiceStatusLabels"
import { computeOutstanding } from "@/lib/invoices/payments"
import { INVOICE_IMPORT_PROVIDER } from "@/lib/invoiceImport/matching"
import { EXPORT_FIELDS, type ExportFieldKey, type ExportRow } from "@/lib/invoices/exportFields"

/** Above this many rows, the request fails with an actionable error rather
 * than risking memory exhaustion or a silent timeout (design.md § Decisions). */
export const EXPORT_ROW_CEILING = 50_000

export class ExportRowLimitExceededError extends Error {
  constructor(public readonly rowCount: number, public readonly limit: number) {
    super(`Export matched ${rowCount} rows, which exceeds the ${limit}-row export limit. Narrow your filters or contact support.`)
    this.name = "ExportRowLimitExceededError"
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  stripe: "Stripe",
  xero: "Xero",
  myob: "MYOB",
  [INVOICE_IMPORT_PROVIDER]: "Spreadsheet import",
}

function accountingSourceLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

function latestPromise(invoice: InvoiceWithRelations) {
  // promisesToPay is already ordered createdAt desc by loadDashboardInvoicesWithTx.
  return invoice.promisesToPay[0] ?? null
}

function disputeStatus(invoice: InvoiceWithRelations): string {
  if (invoice.status === "disputed") return "disputed"
  if (invoice.disputeResolvedAt) return "resolved"
  return "none"
}

function reminderStatus(invoice: InvoiceWithRelations): string {
  if (invoice.status === "sequence_complete") return "Sequence complete"
  if (invoice.currentStage === 0) return "Not yet chased"
  return `Reminder ${STAGE_LABELS[invoice.currentStage] ?? invoice.currentStage}`
}

function invoiceDateFromMetadata(invoice: InvoiceWithRelations): string | null {
  // Only spreadsheet_import rows ever have a canonical invoice date — see
  // design.md "TrackedInvoice has no canonical invoice date field". Never
  // silently defaulted to dueDate/createdAt for other providers.
  if (invoice.provider !== INVOICE_IMPORT_PROVIDER) return null
  const metadata = invoice.providerMetadata as Record<string, unknown> | null
  const value = metadata?.invoice_date
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/**
 * Maps a loaded invoice (with joined payments/promises/dispute fields) to
 * the documented export row shape. Derived values follow design.md exactly:
 * outstanding balance via the shared `computeOutstanding`, paid_date from
 * `updatedAt` only when paid, promise/dispute/reminder status from the
 * same signals the dashboard already surfaces.
 */
export function buildExportRow(invoice: InvoiceWithRelations): ExportRow {
  const promise = latestPromise(invoice)
  const invoiceDate = invoiceDateFromMetadata(invoice)

  const row: ExportRow = {
    invoice_reference: invoice.externalId,
    customer_name: invoice.clientName,
    customer_email: invoice.clientEmail,
    invoice_date: invoiceDate,
    due_date: invoice.dueDate,
    original_amount: invoice.amountDue / 100,
    outstanding_balance: computeOutstanding(invoice, invoice.payments) / 100,
    currency: invoice.currency.toUpperCase(),
    status: invoice.status,
    paid_date: invoice.status === "paid" ? invoice.updatedAt : null,
    promise_to_pay_status: promise?.status ?? null,
    promise_to_pay_date: promise?.promisedPayBy ?? null,
    dispute_status: disputeStatus(invoice),
    reminder_status: reminderStatus(invoice),
    accounting_source: accountingSourceLabel(invoice.provider),
    created_at: invoice.createdAt,
    updated_at: invoice.updatedAt,
  }
  return row
}

/**
 * Neutralises spreadsheet-formula injection in user-controlled text: a value
 * whose trimmed form starts with `=`, `+`, `-`, or `@` is prefixed with a
 * literal leading apostrophe, the standard "force text" convention every
 * major spreadsheet application honours. Never applied to numeric/date/enum
 * fields (design.md § Decisions).
 */
export function sanitiseFormulaValue(value: string): string {
  if (/^[=+\-@]/.test(value.trim())) return `'${value}`
  return value
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function cellText(field: ExportFieldKey, value: string | number | Date | null, fieldDef: (typeof EXPORT_FIELDS)[number]): string {
  if (value === null || value === undefined) return ""
  let text: string
  if (value instanceof Date) {
    text = fieldDef.type === "timestamp" ? value.toISOString() : formatIsoDate(value)
  } else if (typeof value === "number") {
    text = value.toFixed(2)
  } else {
    text = value
  }
  return fieldDef.sanitise ? sanitiseFormulaValue(text) : text
}

/** RFC 4180 field escaping — embedded line breaks are preserved (not
 * collapsed), unlike the import template's simpler csvEscape helper, because
 * reversibility matters more for exported multi-line notes than for a sample row. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** UTF-8 BOM — Microsoft Excel misreads BOM-less UTF-8 CSVs containing
 * non-ASCII characters as a legacy code page; the other target apps handle it fine. */
const UTF8_BOM = "\uFEFF"

export function generateExportCsv(invoices: InvoiceWithRelations[]): string {
  if (invoices.length > EXPORT_ROW_CEILING) {
    throw new ExportRowLimitExceededError(invoices.length, EXPORT_ROW_CEILING)
  }

  const header = EXPORT_FIELDS.map((field) => csvField(field.header)).join(",")
  const lines = invoices.map((invoice) => {
    const row = buildExportRow(invoice)
    return EXPORT_FIELDS.map((field) => csvField(cellText(field.key, row[field.key], field))).join(",")
  })

  return UTF8_BOM + [header, ...lines].join("\r\n") + "\r\n"
}

export function generateExportXlsx(invoices: InvoiceWithRelations[]): Buffer {
  if (invoices.length > EXPORT_ROW_CEILING) {
    throw new ExportRowLimitExceededError(invoices.length, EXPORT_ROW_CEILING)
  }

  const header = EXPORT_FIELDS.map((field) => field.header)
  const sheet = XLSX.utils.aoa_to_sheet([header])

  invoices.forEach((invoice, rowIndex) => {
    const row = buildExportRow(invoice)
    EXPORT_FIELDS.forEach((field, colIndex) => {
      const value = row[field.key]
      const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex })
      if (value === null || value === undefined) {
        return
      }
      if (value instanceof Date) {
        sheet[address] = { t: "d", v: value, z: field.type === "timestamp" ? "yyyy-mm-dd hh:mm:ss" : "yyyy-mm-dd" }
      } else if (typeof value === "number") {
        sheet[address] = { t: "n", v: value, z: "#,##0.00" }
      } else {
        const text = field.sanitise ? sanitiseFormulaValue(value) : value
        sheet[address] = { t: "s", v: text }
      }
    })
  })

  const rowCount = invoices.length + 1
  const colCount = EXPORT_FIELDS.length
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowCount - 1, c: colCount - 1 } })
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }) }
  sheet["!cols"] = EXPORT_FIELDS.map((field) => ({
    wch: Math.max(field.header.length + 2, field.type === "string" ? 24 : 14),
  }))
  // Note: SheetJS Community Edition's XLSX writer does not serialise
  // frozen-pane/sheetView state (verified against its write path) — only
  // autofilter and column widths are honoured here. Frozen header row is a
  // known, documented cosmetic gap alongside cell styling (design.md §
  // Risks/Trade-offs), not a silently-dropped requirement.

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "Invoices")

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true })
}

export function buildExportFilename(format: "csv" | "xlsx", now: Date = new Date()): string {
  const datePart = now.toISOString().slice(0, 10)
  return `paidsoon-invoices-${datePart}.${format}`
}
