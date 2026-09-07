import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { ImportExportSettingsView } from "@/components/settings/ImportExportSettingsView"
import {
  IMPORT_EXPORT_SETTINGS_INVOICE_EXPORT_ANCHOR,
  IMPORT_EXPORT_SETTINGS_INVOICE_IMPORT_ANCHOR,
  IMPORT_EXPORT_SETTINGS_ROUTE,
} from "@/lib/settings/importExportRoutes"

const initialBatches = [
  {
    id: "batch-1",
    fileName: "invoices.csv",
    fileType: "csv",
    status: "completed",
    duplicateMode: "skip_existing",
    rowsTotal: 1,
    rowsValid: 1,
    rowsWarning: 0,
    rowsFailed: 0,
    rowsSkipped: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    validatedAt: "2026-09-01T00:05:00.000Z",
    completedAt: "2026-09-01T00:10:00.000Z",
  },
]

const initialSpendBatches = [
  {
    id: "spend-batch-1",
    fileName: "expenses.csv",
    fileType: "csv",
    status: "completed",
    duplicateMode: "skip_existing",
    rowsTotal: 1,
    rowsValid: 1,
    rowsWarning: 0,
    rowsFailed: 0,
    rowsSkipped: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    validatedAt: "2026-09-01T00:05:00.000Z",
    completedAt: "2026-09-01T00:10:00.000Z",
  },
]

const exportCustomers = [{ id: "customer-1", label: "Acme Pty Ltd" }]

describe("combined settings import/export surface", () => {
  test("exposes canonical combined route anchors", () => {
    assert.equal(IMPORT_EXPORT_SETTINGS_ROUTE, "/dashboard/settings/import-export")
    assert.equal(IMPORT_EXPORT_SETTINGS_INVOICE_IMPORT_ANCHOR, "/dashboard/settings/import-export#invoice-import")
    assert.equal(IMPORT_EXPORT_SETTINGS_INVOICE_EXPORT_ANCHOR, "/dashboard/settings/import-export#invoice-export")
  })

  test("renders invoice import, expense import, and export sections on one page", () => {
    const element = ImportExportSettingsView({
      initialBatches,
      initialSpendBatches,
      canExport: true,
      exportCustomers,
    })
    assert.equal(element.props.className, "space-y-8")

    const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children]
    const sectionIds = children.filter(Boolean).map((child: { props?: { id?: string } }) => child?.props?.id)
    assert.deepEqual(sectionIds, ["invoice-import", "expense-import", "invoice-export"])

    const exportSection = children[2] as { props?: { children?: unknown } }
    const exportClient = Array.isArray(exportSection.props?.children)
      ? exportSection.props.children[0]
      : exportSection.props?.children
    assert.equal((exportClient as { props?: { customers?: unknown } })?.props?.customers, exportCustomers)
  })

  test("locks export section when the user lacks csv export entitlement", () => {
    const element = ImportExportSettingsView({
      initialBatches,
      initialSpendBatches,
      canExport: false,
      exportCustomers: [],
    })
    const children = Array.isArray(element.props.children) ? element.props.children : [element.props.children]
    const exportSection = children.find((child: { props?: { id?: string } }) => child?.props?.id === "invoice-export")
    assert.ok(exportSection)
    assert.match(JSON.stringify(exportSection), /Upgrade now/)
  })
})