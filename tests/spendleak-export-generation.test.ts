import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as XLSX from "xlsx"

import type { SpendInsight } from "@/lib/generated/prisma/client"
import {
  SPENDLEAK_EXPORT_ROW_CEILING,
  SpendLeakExportRowLimitExceededError,
  buildSpendLeakExportFilename,
  buildSpendLeakExportRow,
  generateSpendLeakExportCsv,
  generateSpendLeakExportXlsx,
  sanitiseFormulaValue,
} from "@/lib/spendleak/export"
import { SPENDLEAK_EXPORT_FIELDS } from "@/lib/spendleak/exportFields"

function makeFinding(overrides: Partial<SpendInsight> & { id: string }): SpendInsight {
  return {
    id: overrides.id,
    userId: "user-1",
    accountingConnectionId: null,
    findingType: "recurring_spend",
    subjectKey: "Acme",
    severity: "medium",
    summary: "Recurring spend detected",
    state: "open",
    reviewAction: null,
    reviewActionAt: null,
    reviewActionBy: null,
    reviewNote: null,
    evidenceFingerprint: null,
    estimatedMonthlyCents: 2999,
    estimatedAnnualCents: 35988,
    evidence: {
      supplier: "Acme SaaS",
      amountCents: 2999,
      accountName: "Software subscriptions",
      confidence: "likely leak",
      reference: "INV-778",
      transactionDate: "2026-08-15",
      source: "expense_import",
    },
    detectedAt: new Date("2026-09-01T00:00:00.000Z"),
    resolvedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("sanitiseFormulaValue", () => {
  test("prefixes potentially executable values", () => {
    assert.equal(sanitiseFormulaValue("=2+2"), "'=2+2")
    assert.equal(sanitiseFormulaValue("+cmd"), "'+cmd")
    assert.equal(sanitiseFormulaValue("-12"), "'-12")
    assert.equal(sanitiseFormulaValue("@sum"), "'@sum")
  })

  test("keeps normal text unchanged", () => {
    assert.equal(sanitiseFormulaValue("Acme Pty Ltd"), "Acme Pty Ltd")
  })
})

describe("buildSpendLeakExportRow", () => {
  test("maps core fields and derives spendleak_status", () => {
    const row = buildSpendLeakExportRow(makeFinding({ id: "1" }))
    assert.equal(row.finding_type, "recurring_spend")
    assert.equal(row.supplier_or_counterparty, "Acme SaaS")
    assert.equal(row.expense_category, "Software subscriptions")
    assert.equal(row.spendleak_status, "review")
    assert.equal(row.detection_confidence, "likely leak")
    assert.equal(row.source_transaction_reference, "INV-778")
  })

  test("maps reviewed outcomes keep/cancel/renegotiate directly", () => {
    assert.equal(buildSpendLeakExportRow(makeFinding({ id: "k", reviewAction: "keep" })).spendleak_status, "keep")
    assert.equal(buildSpendLeakExportRow(makeFinding({ id: "c", reviewAction: "cancel" })).spendleak_status, "cancel")
    assert.equal(
      buildSpendLeakExportRow(makeFinding({ id: "r", reviewAction: "renegotiate" })).spendleak_status,
      "renegotiate",
    )
  })

  test("falls back to empty strings for optional evidence fields", () => {
    const row = buildSpendLeakExportRow(
      makeFinding({ id: "2", evidence: { source: "xero" }, estimatedAnnualCents: null, estimatedMonthlyCents: null }),
    )
    assert.equal(row.expense_category, "")
    assert.equal(row.source_transaction_reference, "")
    assert.equal(row.detection_confidence, "")
    assert.equal(row.monthly_cost, null)
    assert.equal(row.annualised_cost, null)
  })
})

describe("generateSpendLeakExportCsv", () => {
  test("starts with UTF-8 BOM and keeps dictionary header order", () => {
    const csv = generateSpendLeakExportCsv([makeFinding({ id: "1" })])
    assert.ok(csv.startsWith("\uFEFF"))
    const header = csv.slice(1).split("\r\n")[0]
    assert.equal(header, SPENDLEAK_EXPORT_FIELDS.map((field) => field.header).join(","))
  })

  test("sanitises string fields and preserves valid numeric values", () => {
    const csv = generateSpendLeakExportCsv([
      makeFinding({
        id: "1",
        evidence: {
          supplier: "=Injected",
          amountCents: 5000,
          source: "expense_import",
        },
      }),
    ])

    assert.match(csv, /'=Injected/)
    assert.match(csv, /50\.00/)
  })

  test("throws when export exceeds row ceiling", () => {
    const findings = Array.from({ length: SPENDLEAK_EXPORT_ROW_CEILING + 1 }, (_, index) =>
      makeFinding({ id: String(index) }),
    )
    assert.throws(() => generateSpendLeakExportCsv(findings), SpendLeakExportRowLimitExceededError)
  })
})

describe("generateSpendLeakExportXlsx", () => {
  test("creates a worksheet named SpendLeak Report with matching header", () => {
    const buffer = generateSpendLeakExportXlsx([makeFinding({ id: "1" })])
    const workbook = XLSX.read(buffer, { type: "buffer" })
    assert.deepEqual(workbook.SheetNames, ["SpendLeak Report"])

    const sheet = workbook.Sheets["SpendLeak Report"]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]
    assert.deepEqual(rows[0], SPENDLEAK_EXPORT_FIELDS.map((field) => field.header))
  })

  test("throws when export exceeds row ceiling", () => {
    const findings = Array.from({ length: SPENDLEAK_EXPORT_ROW_CEILING + 1 }, (_, index) =>
      makeFinding({ id: String(index) }),
    )
    assert.throws(() => generateSpendLeakExportXlsx(findings), SpendLeakExportRowLimitExceededError)
  })
})

describe("buildSpendLeakExportFilename", () => {
  test("follows the documented naming pattern", () => {
    const now = new Date("2026-09-05T00:00:00.000Z")
    assert.equal(buildSpendLeakExportFilename("csv", now), "paidsoon-spendleak-report-2026-09-05.csv")
    assert.equal(buildSpendLeakExportFilename("xlsx", now), "paidsoon-spendleak-report-2026-09-05.xlsx")
  })
})
