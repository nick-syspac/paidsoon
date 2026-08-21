import * as XLSX from "xlsx"

import { INVOICE_IMPORT_CANONICAL_FIELDS } from "@/lib/invoiceImport/template"

export type InvoiceImportFileType = "csv" | "xlsx"

export type ParsedInvoiceImportRow = {
  rowNumber: number
  values: Partial<Record<(typeof INVOICE_IMPORT_CANONICAL_FIELDS)[number], string>>
  // Every detected column for this row, keyed by normalized source column name.
  raw: Record<string, string>
}

export type ParsedInvoiceImportFile = {
  fileType: InvoiceImportFileType
  columns: string[]
  // Every detected column, canonical or not, for downstream mapping.
  sourceColumns: string[]
  rows: ParsedInvoiceImportRow[]
}

const SUPPORTED_EXTENSIONS = new Set([".csv", ".xlsx"])
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function extractFileExtension(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match ? `.${match[1].toLowerCase()}` : ""
}

function assertSupportedExtension(fileName: string): InvoiceImportFileType {
  const ext = extractFileExtension(fileName)

  if (ext === ".csv") return "csv"
  if (ext === ".xlsx") return "xlsx"

  throw new Error(`Unsupported file type for invoice import: ${fileName} (not supported)`)
}

function getWorksheetRows(sheet: XLSX.WorkSheet): Array<Record<string, unknown>> {
  const matrix = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  })

  if (!Array.isArray(matrix) || matrix.length === 0) {
    return []
  }

  const headerRow = Array.isArray(matrix[0]) ? matrix[0] : []
  const headers = headerRow.map((header, index) => {
    const normalized = normalizeHeader(String(header ?? `column_${index + 1}`))
    return normalized || `column_${index + 1}`
  })

  return matrix.slice(1).map((row) => {
    const normalizedRow = Array.isArray(row) ? row : []
    return Object.fromEntries(
      headers.map((header, index) => [header, normalizedRow[index] ?? ""]),
    )
  })
}

function detectFormulaCells(sheet: XLSX.WorkSheet): boolean {
  for (const cellKey of Object.keys(sheet)) {
    if (cellKey.startsWith("!")) continue
    const cell = sheet[cellKey]
    if (cell && typeof cell === "object" && "f" in cell && cell.f) {
      return true
    }
  }

  return false
}

function stringifyCellValue(rawValue: unknown): string {
  return typeof rawValue === "string" ? rawValue.trim() : String(rawValue ?? "").trim()
}

function parseRawRowValues(rawRow: Record<string, unknown>): Record<string, string> {
  const raw: Record<string, string> = {}

  for (const [rawKey, rawValue] of Object.entries(rawRow)) {
    const header = normalizeHeader(rawKey)
    if (!header) continue
    raw[header] = stringifyCellValue(rawValue)
  }

  return raw
}

function parseCanonicalRowValues(rawRow: Record<string, unknown>): ParsedInvoiceImportRow["values"] {
  const values: ParsedInvoiceImportRow["values"] = {}

  for (const [rawKey, rawValue] of Object.entries(rawRow)) {
    const header = normalizeHeader(rawKey)
    if (!INVOICE_IMPORT_CANONICAL_FIELDS.includes(header as (typeof INVOICE_IMPORT_CANONICAL_FIELDS)[number])) {
      continue
    }

    values[header as (typeof INVOICE_IMPORT_CANONICAL_FIELDS)[number]] = stringifyCellValue(rawValue)
  }

  return values
}

export function parseInvoiceImportFile(fileBuffer: Buffer, fileName: string): ParsedInvoiceImportFile {
  const fileType = assertSupportedExtension(fileName)

  if (fileBuffer.length === 0) {
    throw new Error("The uploaded file is empty.")
  }

  if (fileBuffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error("The uploaded file is larger than the supported import size limit.")
  }

  if (fileType === "xlsx") {
    const signature = fileBuffer.subarray(0, 4)
    if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new Error("The uploaded spreadsheet does not have a valid XLSX signature.")
    }
  }

  if (fileType === "csv" && fileBuffer.includes(0x00)) {
    throw new Error("The uploaded CSV contains invalid binary data.")
  }

  let workbook: XLSX.WorkBook

  try {
    workbook = XLSX.read(fileBuffer, {
      type: "array",
      raw: false,
      cellFormula: true,
      cellDates: true,
    })
  } catch (error) {
    throw new Error("The uploaded spreadsheet is invalid or cannot be read.")
  }

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error("The uploaded file does not contain a worksheet.")
  }

  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) {
    throw new Error("The uploaded file could not be read into a worksheet.")
  }

  if (detectFormulaCells(sheet)) {
    throw new Error("Formula cells are not supported in invoice imports.")
  }

  const rows = getWorksheetRows(sheet)
  if (rows.length === 0) {
    throw new Error("The uploaded file does not contain any rows.")
  }

  const rawHeaders = Object.keys(rows[0] ?? {})
  const sourceColumns = rawHeaders.map(normalizeHeader).filter((column): column is string => column.length > 0)

  if (sourceColumns.length === 0) {
    throw new Error("No import columns were detected in the uploaded file.")
  }

  const canonicalColumns = sourceColumns.filter((column) =>
    INVOICE_IMPORT_CANONICAL_FIELDS.includes(column as (typeof INVOICE_IMPORT_CANONICAL_FIELDS)[number]),
  )

  if (canonicalColumns.length === 0) {
    throw new Error("No recognizable PaidSoon invoice columns were found in the uploaded file.")
  }

  const parsedRows: ParsedInvoiceImportRow[] = rows.map((rawRow, index) => ({
    rowNumber: index + 2,
    values: parseCanonicalRowValues(rawRow),
    raw: parseRawRowValues(rawRow),
  }))

  if (fileType === "xlsx" && fileName.toLowerCase().endsWith(".xlsm")) {
    throw new Error(`Unsupported file type for invoice import: ${fileName} (not supported)`)
  }

  if (!SUPPORTED_EXTENSIONS.has(extractFileExtension(fileName))) {
    throw new Error(`Unsupported file type for invoice import: ${fileName} (not supported)`)
  }

  return {
    fileType,
    columns: canonicalColumns,
    sourceColumns,
    rows: parsedRows,
  }
}
