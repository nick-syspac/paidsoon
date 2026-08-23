import { INVOICE_IMPORT_CANONICAL_FIELDS } from "@/lib/invoiceImport/template"

export type InvoiceImportFileType = "csv"

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

  throw new Error(`Unsupported file type for invoice import: ${fileName} (not supported)`)
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

  if (fileType === "csv" && fileBuffer.includes(0x00)) {
    throw new Error("The uploaded CSV contains invalid binary data.")
  }

  const csvText = fileBuffer.toString("utf8")
  const rows = parseCsvRows(csvText)
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

  return {
    fileType,
    columns: canonicalColumns,
    sourceColumns,
    rows: parsedRows,
  }
}

function parseCsvRows(csvText: string): Array<Record<string, unknown>> {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return []
  }

  const headers = parseCsvLine(lines[0] ?? "").map((header, index) => {
    const normalized = normalizeHeader(header || `column_${index + 1}`)
    return normalized || `column_${index + 1}`
  })

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  })
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}
