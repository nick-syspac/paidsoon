import {
  INVOICE_IMPORT_CANONICAL_FIELDS,
  type InvoiceImportCanonicalField,
} from "@/lib/invoiceImport/template"

export type InvoiceImportMappingSuggestion = {
  sourceColumn: string
  targetField: InvoiceImportCanonicalField
  suggested: boolean
}

export type InvoiceImportIssue = {
  rowNumber: number
  field: InvoiceImportCanonicalField | string
  severity: "error" | "warning"
  code: string
  message: string
}

const REQUIRED_FIELDS = [
  "customer_name",
  "customer_email",
  "invoice_number",
  "invoice_date",
  "due_date",
  "amount_outstanding",
] as const satisfies readonly InvoiceImportCanonicalField[]

const HEADER_ALIASES: Record<InvoiceImportCanonicalField, string[]> = {
  customer_name: ["customer name", "customer", "client name", "debtor name"],
  customer_email: ["customer email", "email", "debtor email", "contact email"],
  customer_contact_name: ["customer contact", "contact name", "primary contact", "debtor contact"],
  invoice_number: ["invoice number", "invoice id", "number", "bill number"],
  invoice_date: ["invoice date", "issued date", "date issued"],
  due_date: ["due date", "payment due date", "due on"],
  invoice_total: ["invoice total", "total amount", "gross amount", "amount due"],
  amount_outstanding: ["amount outstanding", "outstanding balance", "balance due", "amount due"],
  currency: ["currency", "currency code", "invoice currency"],
  purchase_order_reference: ["po reference", "purchase order", "purchase order number"],
  payment_url: ["payment url", "pay url", "payment link", "invoice link"],
  invoice_description: ["description", "invoice description", "line item description", "notes"],
  notes: ["notes", "internal notes", "memo"],
  customer_external_id: ["customer external id", "customer id", "debtor external id"],
  invoice_external_id: ["invoice external id", "external invoice id", "external id"],
}

export function normalizeImportHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function inferInvoiceImportColumnMapping(
  headers: string[],
): InvoiceImportMappingSuggestion[] {
  const usedSourceColumns = new Set<string>()

  return headers.flatMap((sourceColumn) => {
    const normalizedSource = normalizeImportHeader(sourceColumn)
    const candidateField = INVOICE_IMPORT_CANONICAL_FIELDS.find((field) => {
      const aliases = HEADER_ALIASES[field]
      return aliases.some((alias) => normalizeImportHeader(alias) === normalizedSource)
    })

    if (!candidateField) {
      return []
    }

    if (usedSourceColumns.has(normalizedSource)) {
      return []
    }

    usedSourceColumns.add(normalizedSource)
    return [{ sourceColumn, targetField: candidateField, suggested: true }]
  })
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol)
  } catch {
    return false
  }
}

function parseMoney(value: string): number | null {
  if (!value.trim()) return null

  const normalized = value
    .trim()
    .replace(/[$,\s]/g, "")
    .replace(/\((.*)\)/, "-$1")

  if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) {
    return null
  }

  const numericValue = Number(normalized)
  return Number.isFinite(numericValue) ? numericValue : null
}

function parseImportDate(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const iso = new Date(trimmed)
  if (!Number.isNaN(iso.getTime())) {
    return iso
  }

  const maybeSlash = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(trimmed)
  if (!maybeSlash) {
    return null
  }

  const [first, second, third] = trimmed.split(/[/-]/)
  const maybeYear = Number(third)
  const year = maybeYear < 100 ? 2000 + maybeYear : maybeYear
  const date = new Date(year, Number(first) - 1, Number(second))
  return Number.isNaN(date.getTime()) ? null : date
}

export function validateInvoiceImportRow(
  row: Partial<Record<InvoiceImportCanonicalField, string>>,
  rowNumber: number,
): InvoiceImportIssue[] {
  const issues: InvoiceImportIssue[] = []

  for (const field of REQUIRED_FIELDS) {
    const value = row[field]?.trim() ?? ""
    if (!value) {
      issues.push({
        rowNumber,
        field,
        severity: "error",
        code: "missing_required_field",
        message: `Missing required value for ${field}.`,
      })
    }
  }

  const email = row.customer_email?.trim() ?? ""
  if (email && !isValidEmail(email)) {
    issues.push({
      rowNumber,
      field: "customer_email",
      severity: "error",
      code: "invalid_email",
      message: "Customer email is not a valid address.",
    })
  }

  const invoiceDate = row.invoice_date?.trim() ?? ""
  const dueDate = row.due_date?.trim() ?? ""

  if (invoiceDate && !parseImportDate(invoiceDate)) {
    issues.push({
      rowNumber,
      field: "invoice_date",
      severity: "error",
      code: "invalid_date",
      message: "Invoice date is not a valid date.",
    })
  }

  if (dueDate && !parseImportDate(dueDate)) {
    issues.push({
      rowNumber,
      field: "due_date",
      severity: "error",
      code: "invalid_date",
      message: "Due date is not a valid date.",
    })
  }

  if (invoiceDate && dueDate) {
    const invoiceParsed = parseImportDate(invoiceDate)
    const dueParsed = parseImportDate(dueDate)
    if (invoiceParsed && dueParsed && invoiceParsed > dueParsed) {
      issues.push({
        rowNumber,
        field: "due_date",
        severity: "warning",
        code: "due_before_invoice",
        message: "Due date is earlier than the invoice date.",
      })
    }
  }

  const outstanding = row.amount_outstanding?.trim() ?? ""
  const outstandingValue = parseMoney(outstanding)
  if (outstanding && outstandingValue === null) {
    issues.push({
      rowNumber,
      field: "amount_outstanding",
      severity: "error",
      code: "invalid_amount",
      message: "Amount outstanding is not a valid number.",
    })
  }

  const total = row.invoice_total?.trim() ?? ""
  if (total) {
    const totalValue = parseMoney(total)
    if (totalValue === null) {
      issues.push({
        rowNumber,
        field: "invoice_total",
        severity: "error",
        code: "invalid_amount",
        message: "Invoice total is not a valid number.",
      })
    } else if (outstandingValue !== null && totalValue < outstandingValue) {
      issues.push({
        rowNumber,
        field: "amount_outstanding",
        severity: "warning",
        code: "outstanding_exceeds_total",
        message: "Outstanding amount exceeds the invoice total.",
      })
    }
  }

  const currency = row.currency?.trim() ?? ""
  if (currency && !/^[A-Z]{3}$/.test(currency.toUpperCase())) {
    issues.push({
      rowNumber,
      field: "currency",
      severity: "error",
      code: "invalid_currency",
      message: "Currency must be a 3-letter ISO code.",
    })
  }

  const paymentUrl = row.payment_url?.trim() ?? ""
  if (paymentUrl && !isValidUrl(paymentUrl)) {
    issues.push({
      rowNumber,
      field: "payment_url",
      severity: "warning",
      code: "invalid_url",
      message: "Payment URL is not a valid https URL.",
    })
  }

  return issues
}

export function summarizeInvoiceImportValidation(
  rows: Array<Partial<Record<InvoiceImportCanonicalField, string>>>,
): {
  totalRows: number
  validRows: number
  warningRows: number
  errorRows: number
  issues: InvoiceImportIssue[]
} {
  const issues: InvoiceImportIssue[] = []

  rows.forEach((row, index) => {
    issues.push(...validateInvoiceImportRow(row, index + 2))
  })

  const errorRows = new Set(
    issues.filter((issue) => issue.severity === "error").map((issue) => issue.rowNumber),
  )
  const warningRows = new Set(
    issues.filter((issue) => issue.severity === "warning").map((issue) => issue.rowNumber),
  )

  return {
    totalRows: rows.length,
    validRows: rows.length - Math.max(errorRows.size, 0),
    warningRows: warningRows.size,
    errorRows: errorRows.size,
    issues,
  }
}
