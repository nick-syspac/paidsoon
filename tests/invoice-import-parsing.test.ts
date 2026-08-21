import { describe, test } from "node:test"
import assert from "node:assert/strict"

import {
  parseInvoiceImportDate,
  parseInvoiceImportMoney,
  validateInvoiceImportRow,
} from "@/lib/invoiceImport/mapping"

describe("parseInvoiceImportMoney", () => {
  test("returns null for an empty or whitespace-only value", () => {
    assert.equal(parseInvoiceImportMoney(""), null)
    assert.equal(parseInvoiceImportMoney("   "), null)
  })

  test("strips currency symbols and thousands separators", () => {
    assert.equal(parseInvoiceImportMoney("$1,234.56"), 1234.56)
    assert.equal(parseInvoiceImportMoney("  $ 2,000  "), 2000)
  })

  test("treats parenthesized amounts as negative", () => {
    assert.equal(parseInvoiceImportMoney("(500.00)"), -500)
    assert.equal(parseInvoiceImportMoney("($1,250.75)"), -1250.75)
  })

  test("accepts a leading sign", () => {
    assert.equal(parseInvoiceImportMoney("+120.5"), 120.5)
    assert.equal(parseInvoiceImportMoney("-45"), -45)
  })

  test("rejects non-numeric or malformed values", () => {
    assert.equal(parseInvoiceImportMoney("abc"), null)
    assert.equal(parseInvoiceImportMoney("12.34.56"), null)
    assert.equal(parseInvoiceImportMoney("$"), null)
    assert.equal(parseInvoiceImportMoney("1,234-56"), null)
  })
})

describe("parseInvoiceImportDate", () => {
  test("returns null for an empty or whitespace-only value", () => {
    assert.equal(parseInvoiceImportDate(""), null)
    assert.equal(parseInvoiceImportDate("   "), null)
  })

  test("parses ISO dates", () => {
    const parsed = parseInvoiceImportDate("2026-09-01")
    assert.ok(parsed)
    assert.equal(parsed?.getUTCFullYear(), 2026)
    assert.equal(parsed?.getUTCMonth(), 8)
    assert.equal(parsed?.getUTCDate(), 1)
  })

  // The slash/dash fallback parser treats the first segment as the month
  // (US-style MM/DD/YYYY).
  test("parses slash-separated MM/DD/YYYY dates with a 4-digit year", () => {
    const parsed = parseInvoiceImportDate("09/15/2026")
    assert.ok(parsed)
    assert.equal(parsed?.getFullYear(), 2026)
    assert.equal(parsed?.getMonth(), 8)
    assert.equal(parsed?.getDate(), 15)
  })

  test("parses dash-separated MM-DD-YY dates with a 2-digit year", () => {
    const parsed = parseInvoiceImportDate("09-15-26")
    assert.ok(parsed)
    assert.equal(parsed?.getFullYear(), 2026)
    assert.equal(parsed?.getMonth(), 8)
    assert.equal(parsed?.getDate(), 15)
  })

  test("returns null for an unparseable value", () => {
    assert.equal(parseInvoiceImportDate("not a date"), null)
    assert.equal(parseInvoiceImportDate("N/A"), null)
  })
})

describe("validateInvoiceImportRow — amount cross-checks", () => {
  test("flags an invoice_total that fails to parse", () => {
    const issues = validateInvoiceImportRow(
      {
        customer_name: "Acme",
        customer_email: "acme@example.com",
        invoice_number: "INV-1",
        due_date: "2026-01-10",
        amount_outstanding: "100",
        invoice_total: "not-a-number",
      },
      1,
    )
    assert.ok(issues.some((issue) => issue.field === "invoice_total" && issue.code === "invalid_amount"))
  })

  test("warns when the outstanding amount exceeds the invoice total", () => {
    const issues = validateInvoiceImportRow(
      {
        customer_name: "Acme",
        customer_email: "acme@example.com",
        invoice_number: "INV-1",
        due_date: "2026-01-10",
        amount_outstanding: "150",
        invoice_total: "100",
      },
      1,
    )
    assert.ok(
      issues.some((issue) => issue.field === "amount_outstanding" && issue.code === "outstanding_exceeds_total"),
    )
  })

  test("accepts a lowercase 3-letter currency code", () => {
    const issues = validateInvoiceImportRow(
      {
        customer_name: "Acme",
        customer_email: "acme@example.com",
        invoice_number: "INV-1",
        due_date: "2026-01-10",
        amount_outstanding: "100",
        currency: "aud",
      },
      1,
    )
    assert.equal(issues.some((issue) => issue.code === "invalid_currency"), false)
  })

  test("passes a fully valid row with no issues", () => {
    const issues = validateInvoiceImportRow(
      {
        customer_name: "Acme",
        customer_email: "acme@example.com",
        invoice_number: "INV-1",
        invoice_date: "2026-01-01",
        due_date: "2026-01-31",
        amount_outstanding: "1,000.00",
        invoice_total: "1,000.00",
        currency: "AUD",
        payment_url: "https://pay.example.com/inv-1",
      },
      1,
    )
    assert.deepEqual(issues, [])
  })
})
