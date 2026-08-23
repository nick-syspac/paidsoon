import assert from "node:assert/strict"
import { test } from "node:test"
import {
  applyInvoiceImportMapping,
  canReuseInvoiceImportMappingProfile,
  detectInvoiceImportFormatHints,
  getMissingRequiredMappingFields,
  inferInvoiceImportColumnMapping,
  validateInvoiceImportRow,
} from "@/lib/invoiceImport/mapping"
import { parseInvoiceImportFile } from "@/lib/invoiceImport/parser"
import {
  INVOICE_IMPORT_CANONICAL_FIELDS,
  INVOICE_IMPORT_TEMPLATE_VERSION,
  buildCsvTemplateContent,
} from "@/lib/invoiceImport/template"

test("invoice import template exposes canonical fields and schema version", () => {
  assert.ok(INVOICE_IMPORT_CANONICAL_FIELDS.length > 0)
  assert.ok(INVOICE_IMPORT_CANONICAL_FIELDS.includes("customer_name"))
  assert.ok(INVOICE_IMPORT_CANONICAL_FIELDS.includes("customer_email"))
  assert.ok(INVOICE_IMPORT_CANONICAL_FIELDS.includes("invoice_number"))
  assert.ok(INVOICE_IMPORT_CANONICAL_FIELDS.includes("amount_outstanding"))
  assert.equal(typeof INVOICE_IMPORT_TEMPLATE_VERSION, "string")
})

test("csv template includes canonical headers and non-deliverable sample addresses", () => {
  const csv = buildCsvTemplateContent()

  assert.match(csv, /^customer_name,customer_email/)
  assert.match(csv, /Example Plumbing Pty Ltd/)
  assert.match(csv, /accounts@example-plumbing\.invalid/)
  assert.match(csv, /finance@example-design\.invalid/)
  assert.match(csv, /INV-1042/)
  assert.match(csv, /INV-1043/)
})

test("invoice import parser accepts a valid CSV template export", () => {
  const csv = buildCsvTemplateContent()
  const parsed = parseInvoiceImportFile(Buffer.from(csv, "utf8"), "paidsoon-template.csv")

  assert.equal(parsed.fileType, "csv")
  assert.ok(parsed.columns.includes("customer_name"))
  assert.ok(parsed.columns.includes("customer_email"))
  assert.ok(parsed.sourceColumns.includes("customer_name"))
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0]?.values.customer_name, "Example Plumbing Pty Ltd")
  assert.equal(parsed.rows[0]?.raw.customer_name, "Example Plumbing Pty Ltd")
})

test("invoice import parser rejects unsupported or unsafe spreadsheet content", () => {
  assert.throws(
    () => parseInvoiceImportFile(Buffer.from("customer_name,customer_email\nAcme,hello@example.com\n"), "notes.txt"),
    /Unsupported file type/i,
  )

  assert.throws(
    () => parseInvoiceImportFile(Buffer.from("customer_name,customer_email\nAcme,hello@example.com\n"), "invoice-import.xlsx"),
    /not supported/i,
  )
})

test("invoice import header mapping infers canonical fields from common aliases", () => {
  const mappings = inferInvoiceImportColumnMapping([
    "Customer Name",
    "Customer Email",
    "Invoice Number",
    "Amount Outstanding",
    "Due Date",
  ])

  assert.deepEqual(
    mappings.map((entry) => entry.targetField),
    ["customer_name", "customer_email", "invoice_number", "amount_outstanding", "due_date"],
  )
  assert.ok(mappings.every((entry) => entry.suggested))
})

test("invoice import validation catches missing and malformed row values", () => {
  const issues = validateInvoiceImportRow(
    {
      customer_name: "Acme Pty Ltd",
      customer_email: "not-an-email",
      invoice_number: "INV-100",
      invoice_date: "2026-01-15",
      due_date: "2026-01-10",
      amount_outstanding: "not-a-number",
      currency: "US",
      payment_url: "not-a-url",
    },
    7,
  )

  assert.ok(issues.some((issue) => issue.code === "invalid_email"))
  assert.ok(issues.some((issue) => issue.code === "due_before_invoice"))
  assert.ok(issues.some((issue) => issue.code === "invalid_amount"))
  assert.ok(issues.some((issue) => issue.code === "invalid_currency"))
  assert.ok(issues.some((issue) => issue.code === "invalid_url"))
})

test("saved invoice-import profiles are only reused when headings remain compatible", () => {
  const profile = {
    name: "Standard AU imports",
    schemaVersion: INVOICE_IMPORT_TEMPLATE_VERSION,
    mapping: {
      "Customer Name": "customer_name",
      "Customer Email": "customer_email",
      "Invoice #": "invoice_number",
    },
  }

  assert.equal(
    canReuseInvoiceImportMappingProfile(profile, ["Customer Name", "Customer Email", "Invoice #"]),
    true,
  )
  assert.equal(
    canReuseInvoiceImportMappingProfile(profile, ["Customer Name", "Customer Email", "Invoice ID"]),
    false,
  )
})

test("invoice-import format detection exposes explicit ambiguity prompts", () => {
  const unambiguous = detectInvoiceImportFormatHints([
    ["2026-01-15", "2026-01-30"],
    ["1250.50", "890.00"],
    ["A$ 1,250.50", "A$ 890.00"],
  ])

  assert.equal(unambiguous.dateFormat, "yyyy-mm-dd")
  assert.equal(unambiguous.numberFormat, "dot")
  assert.equal(unambiguous.ambiguous, false)

  const ambiguous = detectInvoiceImportFormatHints([
    ["01/02/2026", "02/03/2026"],
    ["1.234,56", "2.345,67"],
  ])

  assert.equal(ambiguous.ambiguous, true)
  assert.match(ambiguous.prompt, /ambiguous|choose/i)
})

test("applyInvoiceImportMapping maps raw staging values onto canonical fields", () => {
  const raw = {
    customer_name: "Acme Pty Ltd",
    invoice_number: "INV-9001",
  }

  const values = applyInvoiceImportMapping(raw, {
    "Customer Name": "customer_name",
    "Invoice Number": "invoice_number",
  })

  assert.equal(values.customer_name, "Acme Pty Ltd")
  assert.equal(values.invoice_number, "INV-9001")
})

test("getMissingRequiredMappingFields identifies unmapped required fields", () => {
  const missing = getMissingRequiredMappingFields({
    customer_name: "customer_name",
    customer_email: "customer_email",
  })

  assert.ok(missing.includes("invoice_number"))
  assert.ok(missing.includes("due_date"))
  assert.ok(missing.includes("amount_outstanding"))
  assert.ok(!missing.includes("customer_name"))
})
