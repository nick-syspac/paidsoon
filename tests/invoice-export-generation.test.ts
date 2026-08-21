import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as XLSX from "xlsx"

import {
  EXPORT_ROW_CEILING,
  ExportRowLimitExceededError,
  buildExportFilename,
  buildExportRow,
  generateExportCsv,
  generateExportXlsx,
  sanitiseFormulaValue,
} from "@/lib/invoices/export"
import { EXPORT_FIELDS } from "@/lib/invoices/exportFields"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"

function makeInvoice(overrides: Partial<InvoiceWithRelations> & { id: string }): InvoiceWithRelations {
  return {
    userId: "user-1",
    invoiceConnectionId: "conn-1",
    customerId: null,
    externalId: `INV-${overrides.id}`,
    provider: "stripe",
    clientEmail: "client@example.com",
    clientName: "Client Pty Ltd",
    amountDue: 165000,
    currency: "aud",
    dueDate: new Date("2026-06-01T00:00:00.000Z"),
    status: "pending",
    currentStage: 0,
    nextEmailAt: null,
    snoozedUntil: null,
    firstChasedAt: null,
    providerMetadata: null,
    p2pToken: null,
    disputeNote: null,
    disputeRaisedAt: null,
    disputeResolvedAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
    emailLogs: [],
    promisesToPay: [],
    arrangementCoverages: [],
    payments: [],
    ...overrides,
  } as InvoiceWithRelations
}

describe("sanitiseFormulaValue", () => {
  test("prefixes values starting with =, +, -, or @ with a leading apostrophe", () => {
    assert.equal(sanitiseFormulaValue("=1+1"), "'=1+1")
    assert.equal(sanitiseFormulaValue("+1"), "'+1")
    assert.equal(sanitiseFormulaValue("-1"), "'-1")
    assert.equal(sanitiseFormulaValue("@SUM(1)"), "'@SUM(1)")
  })

  test("leaves ordinary text untouched", () => {
    assert.equal(sanitiseFormulaValue("Acme Pty Ltd"), "Acme Pty Ltd")
  })

  test("round-trips: stripping the leading apostrophe recovers the original value", () => {
    const sanitised = sanitiseFormulaValue("=1+1")
    assert.equal(sanitised.slice(1), "=1+1")
  })
})

describe("buildExportRow", () => {
  test("maps core fields directly from the invoice", () => {
    const row = buildExportRow(makeInvoice({ id: "1" }))
    assert.equal(row.invoice_reference, "INV-1")
    assert.equal(row.customer_name, "Client Pty Ltd")
    assert.equal(row.customer_email, "client@example.com")
    assert.equal(row.currency, "AUD")
    assert.equal(row.status, "pending")
    assert.equal(row.original_amount, 1650)
  })

  test("invoice_date is empty for non-spreadsheet_import providers even when providerMetadata is present", () => {
    const row = buildExportRow(
      makeInvoice({ id: "1", provider: "stripe", providerMetadata: { invoice_date: "2026-01-01" } }),
    )
    assert.equal(row.invoice_date, null)
  })

  test("invoice_date is populated for spreadsheet_import rows", () => {
    const row = buildExportRow(
      makeInvoice({ id: "1", provider: "spreadsheet_import", providerMetadata: { invoice_date: "2026-01-01" } }),
    )
    assert.equal(row.invoice_date, "2026-01-01")
  })

  test("outstanding_balance reflects recorded payments", () => {
    const row = buildExportRow(
      makeInvoice({ id: "1", amountDue: 10000, payments: [{ amount: 4000 } as InvoiceWithRelations["payments"][number]] }),
    )
    assert.equal(row.outstanding_balance, 60)
  })

  test("paid_date is only set when status is paid", () => {
    const paid = buildExportRow(makeInvoice({ id: "1", status: "paid", updatedAt: new Date("2026-05-10") }))
    assert.deepEqual(paid.paid_date, new Date("2026-05-10"))

    const pending = buildExportRow(makeInvoice({ id: "2", status: "pending" }))
    assert.equal(pending.paid_date, null)
  })

  test("promise_to_pay fields come from the most recent promise, empty when none exist", () => {
    const withPromise = buildExportRow(
      makeInvoice({
        id: "1",
        promisesToPay: [
          { status: "active", promisedPayBy: new Date("2026-06-20") } as InvoiceWithRelations["promisesToPay"][number],
        ],
      }),
    )
    assert.equal(withPromise.promise_to_pay_status, "active")
    assert.deepEqual(withPromise.promise_to_pay_date, new Date("2026-06-20"))

    const withoutPromise = buildExportRow(makeInvoice({ id: "2" }))
    assert.equal(withoutPromise.promise_to_pay_status, null)
    assert.equal(withoutPromise.promise_to_pay_date, null)
  })

  test("dispute_status is disputed, resolved, or none", () => {
    assert.equal(buildExportRow(makeInvoice({ id: "1", status: "disputed" })).dispute_status, "disputed")
    assert.equal(
      buildExportRow(makeInvoice({ id: "2", status: "pending", disputeResolvedAt: new Date() })).dispute_status,
      "resolved",
    )
    assert.equal(buildExportRow(makeInvoice({ id: "3", status: "pending" })).dispute_status, "none")
  })

  test("reminder_status reflects currentStage and sequence_complete status", () => {
    assert.equal(buildExportRow(makeInvoice({ id: "1", currentStage: 0 })).reminder_status, "Not yet chased")
    assert.equal(buildExportRow(makeInvoice({ id: "2", currentStage: 1 })).reminder_status, "Reminder 1 of 3 sent")
    assert.equal(
      buildExportRow(makeInvoice({ id: "3", status: "sequence_complete", currentStage: 3 })).reminder_status,
      "Sequence complete",
    )
  })

  test("accounting_source maps provider to a display label", () => {
    assert.equal(buildExportRow(makeInvoice({ id: "1", provider: "xero" })).accounting_source, "Xero")
    assert.equal(buildExportRow(makeInvoice({ id: "2", provider: "myob" })).accounting_source, "MYOB")
    assert.equal(
      buildExportRow(makeInvoice({ id: "3", provider: "spreadsheet_import" })).accounting_source,
      "Spreadsheet import",
    )
  })
})

describe("generateExportCsv", () => {
  test("starts with a UTF-8 BOM and includes the header row matching the data dictionary order", () => {
    const csv = generateExportCsv([makeInvoice({ id: "1" })])
    assert.ok(csv.startsWith("\uFEFF"))
    const header = csv.slice(1).split("\r\n")[0]
    assert.equal(header, EXPORT_FIELDS.map((f) => f.header).join(","))
  })

  test("quotes fields containing commas, quotes, or embedded line breaks (RFC 4180), preserving line breaks", () => {
    const csv = generateExportCsv([
      makeInvoice({ id: "1", clientName: 'Acme, "The Best" Ltd\nSecond line' }),
    ])
    assert.match(csv, /"Acme, ""The Best"" Ltd\nSecond line"/)
  })

  test("preserves Unicode characters", () => {
    const csv = generateExportCsv([makeInvoice({ id: "1", clientName: "Café Müller — 日本語" })])
    assert.match(csv, /Café Müller — 日本語/)
  })

  test("sanitises formula-like customer text but not negative amounts or past dates", () => {
    const csv = generateExportCsv([
      makeInvoice({
        id: "1",
        clientName: "=1+1",
        amountDue: -500,
        dueDate: new Date("2020-01-01"),
      }),
    ])
    assert.match(csv, /'=1\+1/)
    assert.match(csv, /-5\.00/)
    assert.match(csv, /2020-01-01/)
  })

  test("renders empty values as empty fields, never 'null' or 'undefined'", () => {
    const csv = generateExportCsv([makeInvoice({ id: "1" })])
    assert.doesNotMatch(csv, /null|undefined/i)
  })

  test("throws ExportRowLimitExceededError above the row ceiling", () => {
    const invoices = Array.from({ length: EXPORT_ROW_CEILING + 1 }, (_, i) => makeInvoice({ id: String(i) }))
    assert.throws(() => generateExportCsv(invoices), ExportRowLimitExceededError)
  })
})

describe("generateExportXlsx", () => {
  test("produces a workbook with a worksheet named 'Invoices' and matching header", () => {
    const buffer = generateExportXlsx([makeInvoice({ id: "1" })])
    const workbook = XLSX.read(buffer, { type: "buffer" })
    assert.deepEqual(workbook.SheetNames, ["Invoices"])
    const sheet = workbook.Sheets.Invoices
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]
    assert.deepEqual(rows[0], EXPORT_FIELDS.map((f) => f.header))
  })

  test("writes amount and date columns as native numeric/date cell types", () => {
    const buffer = generateExportXlsx([makeInvoice({ id: "1", amountDue: 165000 })])
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
    const sheet = workbook.Sheets.Invoices
    const amountColIndex = EXPORT_FIELDS.findIndex((f) => f.key === "original_amount")
    const dueDateColIndex = EXPORT_FIELDS.findIndex((f) => f.key === "due_date")
    const amountCell = sheet[XLSX.utils.encode_cell({ r: 1, c: amountColIndex })]
    const dueDateCell = sheet[XLSX.utils.encode_cell({ r: 1, c: dueDateColIndex })]
    assert.equal(amountCell.t, "n")
    assert.equal(amountCell.v, 1650)
    assert.equal(dueDateCell.t, "d")
  })

  test("enables autofilter over the header range and sets column widths", () => {
    const buffer = generateExportXlsx([makeInvoice({ id: "1" })])
    const workbook = XLSX.read(buffer, { type: "buffer", cellStyles: true })
    const sheet = workbook.Sheets.Invoices
    assert.ok(sheet["!autofilter"])
    assert.ok(sheet["!cols"] && sheet["!cols"].length === EXPORT_FIELDS.length)
  })

  test("throws ExportRowLimitExceededError above the row ceiling", () => {
    const invoices = Array.from({ length: EXPORT_ROW_CEILING + 1 }, (_, i) => makeInvoice({ id: String(i) }))
    assert.throws(() => generateExportXlsx(invoices), ExportRowLimitExceededError)
  })
})

describe("buildExportFilename", () => {
  test("follows the documented pattern for both formats", () => {
    const now = new Date("2026-08-21T00:00:00.000Z")
    assert.equal(buildExportFilename("csv", now), "paidsoon-invoices-2026-08-21.csv")
    assert.equal(buildExportFilename("xlsx", now), "paidsoon-invoices-2026-08-21.xlsx")
  })
})
