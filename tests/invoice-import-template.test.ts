import assert from "node:assert/strict"
import { test } from "node:test"
import * as XLSX from "xlsx"

import { inferInvoiceImportColumnMapping, validateInvoiceImportRow } from "@/lib/invoiceImport/mapping"
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
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0]?.values.customer_name, "Example Plumbing Pty Ltd")
})

test("invoice import parser rejects unsupported or unsafe spreadsheet content", () => {
  assert.throws(
    () => parseInvoiceImportFile(Buffer.from("customer_name,customer_email\nAcme,hello@example.com\n"), "notes.txt"),
    /Unsupported file type/i,
  )

  assert.throws(
    () => parseInvoiceImportFile(Buffer.from("customer_name,customer_email\nAcme,hello@example.com\n"), "invoice-import.xlsm"),
    /not supported/i,
  )

  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ["customer_name", "customer_email", "invoice_number"],
    ["=SUM(1,1)", "hello@example.com", "INV-0001"],
  ])

  sheet["A2"] = { t: "n", f: "SUM(1,1)", v: 2 }
  XLSX.utils.book_append_sheet(workbook, sheet, "Invoices")

  const unsafeBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

  assert.throws(() => parseInvoiceImportFile(unsafeBuffer, "unsafe.xlsx"), /Formula/i)
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
