import * as XLSX from "xlsx"

export type SpendImportFileType = "csv" | "xlsx"

export type ParsedSpendImportRow = {
  rowNumber: number
  raw: Record<string, string>
}

export type ParsedSpendImportFile = {
  fileType: SpendImportFileType
  sourceColumns: string[]
  rows: ParsedSpendImportRow[]
  worksheetName: string | null
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

function assertSupportedExtension(fileName: string): SpendImportFileType {
  const ext = extractFileExtension(fileName)
  if (ext === ".csv") return "csv"
  if (ext === ".xlsx") return "xlsx"
  throw new Error(`Unsupported file type for spend import: ${fileName}`)
}

function stringifyCellValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim()
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

function parseCsvRows(csvText: string): Array<Record<string, unknown>> {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return []

  const headers = parseCsvLine(lines[0] ?? "").map((header, index) => {
    const normalized = normalizeHeader(header || `column_${index + 1}`)
    return normalized || `column_${index + 1}`
  })

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  })
}

function parseXlsxRows(fileBuffer: Buffer): { rows: Array<Record<string, unknown>>; worksheetName: string | null } {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" })
  const firstSheetName = workbook.SheetNames[0] ?? null
  if (!firstSheetName) return { rows: [], worksheetName: null }

  const worksheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: "",
  })
  return { rows, worksheetName: firstSheetName }
}

export function parseSpendImportFile(fileBuffer: Buffer, fileName: string): ParsedSpendImportFile {
  const fileType = assertSupportedExtension(fileName)

  if (fileBuffer.length === 0) throw new Error("The uploaded file is empty.")
  if (fileBuffer.length > MAX_IMPORT_FILE_BYTES) throw new Error("The uploaded file is larger than the supported import size limit.")
  if (fileType === "csv" && fileBuffer.includes(0x00)) {
    throw new Error("The uploaded CSV contains invalid binary data.")
  }

  const parsed =
    fileType === "csv"
      ? { rows: parseCsvRows(fileBuffer.toString("utf8")), worksheetName: null }
      : parseXlsxRows(fileBuffer)

  if (parsed.rows.length === 0) {
    throw new Error("The uploaded file does not contain any rows.")
  }

  const sourceColumns = Object.keys(parsed.rows[0] ?? {})
    .map((column) => normalizeHeader(column))
    .filter((column): column is string => column.length > 0)

  if (sourceColumns.length === 0) {
    throw new Error("No import columns were detected in the uploaded file.")
  }

  const rows: ParsedSpendImportRow[] = parsed.rows.map((rawRow, index) => {
    const normalizedRaw = Object.fromEntries(
      Object.entries(rawRow).map(([key, value]) => [normalizeHeader(key), stringifyCellValue(value)]),
    ) as Record<string, string>

    return {
      rowNumber: index + 2,
      raw: normalizedRaw,
    }
  })

  return {
    fileType,
    sourceColumns,
    rows,
    worksheetName: parsed.worksheetName,
  }
}
