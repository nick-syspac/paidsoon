import assert from "node:assert/strict"
import { describe, test } from "node:test"
import * as XLSX from "xlsx"

import {
  applySpendImportMapping,
  getMissingRequiredSpendMappingFields,
  inferSpendImportColumnMapping,
  parseSpendImportDate,
  parseSpendImportMoney,
  validateSpendImportRow,
} from "@/lib/spendImport/mapping"
import { parseSpendImportFile } from "@/lib/spendImport/parser"

describe("spend import parser", () => {
  test("parses CSV rows and normalizes headers", () => {
    const csv = [
      "Supplier Name,Amount,Transaction Date,Source Type",
      "Acme Pty Ltd,125.40,2026-09-01,bill",
      "Northwind Co,44.00,2026-09-02,transaction",
    ].join("\n")

    const parsed = parseSpendImportFile(Buffer.from(csv, "utf8"), "expenses.csv")

    assert.equal(parsed.fileType, "csv")
    assert.equal(parsed.worksheetName, null)
    assert.deepEqual(parsed.sourceColumns, ["supplier_name", "amount", "transaction_date", "source_type"])
    assert.equal(parsed.rows.length, 2)
    assert.equal(parsed.rows[0]?.rowNumber, 2)
    assert.equal(parsed.rows[0]?.raw.supplier_name, "Acme Pty Ltd")
    assert.equal(parsed.rows[1]?.raw.source_type, "transaction")
  })

  test("parses XLSX first sheet", () => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet([
      {
        supplier_name: "Acme Pty Ltd",
        amount: "99.95",
        transaction_date: "2026-09-03",
      },
    ])
    XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses")

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    const parsed = parseSpendImportFile(buffer, "expenses.xlsx")

    assert.equal(parsed.fileType, "xlsx")
    assert.equal(parsed.worksheetName, "Expenses")
    assert.equal(parsed.rows.length, 1)
    assert.equal(parsed.rows[0]?.raw.amount, "99.95")
  })

  test("rejects unsupported file extension", () => {
    assert.throws(
      () => parseSpendImportFile(Buffer.from("supplier,amount"), "expenses.txt"),
      /Unsupported file type for spend import/,
    )
  })
})

describe("spend import mapping", () => {
  test("infers field mapping and detects required mapping gaps", () => {
    const mapping = inferSpendImportColumnMapping(["supplier", "amount", "date", "reference"])

    assert.equal(mapping.supplier, "supplier_name")
    assert.equal(mapping.amount, "amount")
    assert.equal(mapping.date, "transaction_date")

    const missing = getMissingRequiredSpendMappingFields({
      supplier: "supplier_name",
      amount: "amount",
    })
    assert.deepEqual(missing, ["transaction_date"])
  })

  test("maps rows and validates blocking issues", () => {
    const mapped = applySpendImportMapping(
      {
        supplier: "",
        amount: "abc",
        date: "not-a-date",
        type: "other",
      },
      {
        supplier: "supplier_name",
        amount: "amount",
        date: "transaction_date",
        type: "source_type",
      },
    )

    const issues = validateSpendImportRow(mapped, 2)
    assert.equal(issues.length, 4)
    assert.equal(issues.filter((issue) => issue.severity === "error").length, 3)
    assert.equal(issues.filter((issue) => issue.code === "unknown_source_type").length, 1)
  })

  test("parses money and date helpers", () => {
    assert.equal(parseSpendImportMoney("$1,234.50"), 1234.5)
    assert.equal(parseSpendImportMoney(""), null)

    const parsedDate = parseSpendImportDate("2026-09-01")
    assert.ok(parsedDate instanceof Date)
    assert.equal(parseSpendImportDate("invalid"), null)
  })
})
