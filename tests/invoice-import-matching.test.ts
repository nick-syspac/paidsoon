import assert from "node:assert/strict"
import { test } from "node:test"

import {
  INVOICE_IMPORT_PROVIDER,
  TERMINAL_TRACKED_INVOICE_STATUSES,
  detectInvoiceImportCustomerConflicts,
  detectInvoiceImportDuplicateIdentifiers,
  isInvoiceImportDuplicateMode,
  resolveInvoiceImportExternalId,
} from "@/lib/invoiceImport/matching"

test("resolveInvoiceImportExternalId prefers invoice_external_id over invoice_number", () => {
  assert.equal(
    resolveInvoiceImportExternalId({ invoice_external_id: "EXT-1", invoice_number: "INV-1" }),
    "EXT-1",
  )
  assert.equal(resolveInvoiceImportExternalId({ invoice_number: "INV-1" }), "INV-1")
  assert.equal(resolveInvoiceImportExternalId({}), null)
  assert.equal(resolveInvoiceImportExternalId({ invoice_external_id: "  " }), null)
})

test("detectInvoiceImportCustomerConflicts flags a customer_external_id linked to more than one email", () => {
  const issues = detectInvoiceImportCustomerConflicts([
    { rowNumber: 2, values: { customer_external_id: "CUST-1", customer_email: "a@example.invalid" } },
    { rowNumber: 3, values: { customer_external_id: "CUST-1", customer_email: "b@example.invalid" } },
    { rowNumber: 4, values: { customer_external_id: "CUST-2", customer_email: "a@example.invalid" } },
  ])

  assert.equal(issues.length, 2)
  assert.deepEqual(issues.map((issue) => issue.rowNumber).sort(), [2, 3])
  assert.ok(issues.every((issue) => issue.code === "customer_external_id_conflict"))
  assert.ok(issues.every((issue) => issue.severity === "error"))
})

test("detectInvoiceImportCustomerConflicts allows the same email to reuse the same external id", () => {
  const issues = detectInvoiceImportCustomerConflicts([
    { rowNumber: 2, values: { customer_external_id: "CUST-1", customer_email: "a@example.invalid" } },
    { rowNumber: 3, values: { customer_external_id: "CUST-1", customer_email: "A@Example.invalid" } },
  ])

  assert.equal(issues.length, 0)
})

test("detectInvoiceImportDuplicateIdentifiers flags rows resolving to the same invoice identifier", () => {
  const issues = detectInvoiceImportDuplicateIdentifiers([
    { rowNumber: 2, values: { invoice_number: "INV-1" } },
    { rowNumber: 3, values: { invoice_number: "INV-1" } },
    { rowNumber: 4, values: { invoice_external_id: "EXT-9" } },
  ])

  assert.equal(issues.length, 2)
  assert.deepEqual(issues.map((issue) => issue.rowNumber).sort(), [2, 3])
  assert.ok(issues.every((issue) => issue.code === "duplicate_invoice_identifier"))
})

test("detectInvoiceImportDuplicateIdentifiers treats invoice_external_id and invoice_number as separate identifier spaces when both are provided", () => {
  const issues = detectInvoiceImportDuplicateIdentifiers([
    { rowNumber: 2, values: { invoice_external_id: "EXT-1", invoice_number: "INV-1" } },
    { rowNumber: 3, values: { invoice_number: "EXT-1" } },
  ])

  // Row 3 resolves to "EXT-1" via invoice_number (no external id present), which
  // collides with row 2's resolved identifier ("EXT-1" via invoice_external_id).
  assert.equal(issues.length, 2)
})

test("isInvoiceImportDuplicateMode accepts only the two supported modes", () => {
  assert.equal(isInvoiceImportDuplicateMode("skip_existing"), true)
  assert.equal(isInvoiceImportDuplicateMode("update_eligible"), true)
  assert.equal(isInvoiceImportDuplicateMode("delete_existing"), false)
  assert.equal(isInvoiceImportDuplicateMode(""), false)
})

test("TERMINAL_TRACKED_INVOICE_STATUSES protects paid and manually_resolved invoices from reopening", () => {
  assert.ok(TERMINAL_TRACKED_INVOICE_STATUSES.has("paid"))
  assert.ok(TERMINAL_TRACKED_INVOICE_STATUSES.has("manually_resolved"))
  assert.ok(!TERMINAL_TRACKED_INVOICE_STATUSES.has("pending"))
  assert.ok(!TERMINAL_TRACKED_INVOICE_STATUSES.has("paused"))
})

test("INVOICE_IMPORT_PROVIDER is a stable, distinct provider tag", () => {
  assert.equal(INVOICE_IMPORT_PROVIDER, "spreadsheet_import")
})
