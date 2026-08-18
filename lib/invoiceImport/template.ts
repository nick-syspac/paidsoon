import * as XLSX from "xlsx"

export const INVOICE_IMPORT_TEMPLATE_VERSION = "invoice-import-v1"

export const INVOICE_IMPORT_CANONICAL_FIELDS = [
  "customer_name",
  "customer_email",
  "customer_contact_name",
  "invoice_number",
  "invoice_date",
  "due_date",
  "invoice_total",
  "amount_outstanding",
  "currency",
  "purchase_order_reference",
  "payment_url",
  "invoice_description",
  "notes",
  "customer_external_id",
  "invoice_external_id",
] as const

export type InvoiceImportCanonicalField = (typeof INVOICE_IMPORT_CANONICAL_FIELDS)[number]

const SAMPLE_ROWS: Record<InvoiceImportCanonicalField, string>[] = [
  {
    customer_name: "Example Plumbing Pty Ltd",
    customer_email: "accounts@example-plumbing.invalid",
    customer_contact_name: "Alex Example",
    invoice_number: "INV-1042",
    invoice_date: "2026-07-01",
    due_date: "2026-07-31",
    invoice_total: "1650.00",
    amount_outstanding: "825.00",
    currency: "AUD",
    purchase_order_reference: "PO-7782",
    payment_url: "https://pay.example.invalid/inv-1042",
    invoice_description: "Second progress payment",
    notes: "Example data - delete this row",
    customer_external_id: "CUST-001",
    invoice_external_id: "EXT-INV-1042",
  },
  {
    customer_name: "Example Design Studio Pty Ltd",
    customer_email: "finance@example-design.invalid",
    customer_contact_name: "Taylor Example",
    invoice_number: "INV-1043",
    invoice_date: "2026-07-15",
    due_date: "2026-08-14",
    invoice_total: "990.00",
    amount_outstanding: "990.00",
    currency: "AUD",
    purchase_order_reference: "",
    payment_url: "",
    invoice_description: "Design services",
    notes: "Example data - delete this row",
    customer_external_id: "CUST-002",
    invoice_external_id: "EXT-INV-1043",
  },
]

function csvEscape(value: string): string {
  const escaped = value.replace(/\r?\n/g, " ")
  if (/[",]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`
  }
  return escaped
}

export function buildCsvTemplateContent(): string {
  const header = INVOICE_IMPORT_CANONICAL_FIELDS.join(",")
  const rows = SAMPLE_ROWS.map((row) =>
    INVOICE_IMPORT_CANONICAL_FIELDS.map((field) => csvEscape(row[field] ?? "")).join(","),
  )

  return [header, ...rows].join("\n") + "\n"
}

export function buildXlsxTemplateWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()

  const instructions = [
    ["PaidSoon Invoice Import Template"],
    [""],
    ["Required columns: customer_name, customer_email, invoice_number, invoice_date, due_date, amount_outstanding"],
    ["Optional columns: customer_contact_name, customer_cc_email, customer_phone, customer_external_id, invoice_external_id, invoice_total, currency, purchase_order_reference, payment_url, invoice_description, notes"],
    ["Rules:"],
    ["- One row per invoice"],
    ["- Use ISO dates (YYYY-MM-DD) or Australian dates (DD/MM/YYYY) if explicitly selected"],
    ["- Values with decimal amounts should use a supported number format"],
    ["- Replace sample rows before importing live data"],
    ["- Emails must be valid and deliverable for the reminder workflow to be used"],
    ["- Rows with outstanding amount zero are accepted only as skipped rows"],
  ]

  const invoiceSheetRows = [
    INVOICE_IMPORT_CANONICAL_FIELDS,
    ...SAMPLE_ROWS.map((row) => INVOICE_IMPORT_CANONICAL_FIELDS.map((field) => row[field] ?? "")),
  ]

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions)
  const invoicesSheet = XLSX.utils.aoa_to_sheet(invoiceSheetRows)

  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions")
  XLSX.utils.book_append_sheet(workbook, invoicesSheet, "Invoices")

  return workbook
}
