import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildSpendImportCsvTemplateContent, SPEND_IMPORT_CANONICAL_FIELDS } from "@/lib/spendImport/template"

describe("spend import template", () => {
  test("builds a csv template with canonical header and sample rows", () => {
    const csv = buildSpendImportCsvTemplateContent()
    const lines = csv.trim().split("\n")

    assert.equal(lines[0], SPEND_IMPORT_CANONICAL_FIELDS.join(","))
    assert.ok(lines.length >= 3)
    assert.match(lines[1], /Acme Office Supplies/)
    assert.match(lines[2], /Harbour Freight Couriers/)
  })
})
