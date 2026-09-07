import { SPEND_IMPORT_REQUIRED_FIELDS, type SpendImportCanonicalField } from "@/lib/spendImport/template"

export interface SpendImportIssue {
  rowNumber: number
  field: SpendImportCanonicalField | "row"
  code: string
  severity: "error" | "warning"
  message: string
}

const FIELD_ALIASES: Record<SpendImportCanonicalField, string[]> = {
  expense_id: ["expense_id", "id", "bill_id", "transaction_id", "reference_id"],
  source_type: ["source_type", "type", "entry_type", "record_type"],
  supplier_name: ["supplier_name", "supplier", "vendor", "merchant", "counterparty"],
  description: ["description", "memo", "details"],
  reference: ["reference", "invoice_number", "doc_number"],
  amount: ["amount", "amount_total", "total", "debit", "spend"],
  currency: ["currency", "currency_code"],
  transaction_date: ["transaction_date", "date", "paid_date", "invoice_date"],
  due_date: ["due_date", "renewal_date"],
  status: ["status"],
  account_code: ["account_code", "gl_code", "category_code"],
  account_name: ["account_name", "category", "account"],
}

export function inferSpendImportColumnMapping(sourceColumns: string[]): Record<string, SpendImportCanonicalField> {
  const mapping: Record<string, SpendImportCanonicalField> = {}

  for (const sourceColumn of sourceColumns) {
    const normalized = sourceColumn.trim().toLowerCase()
    for (const [targetField, aliases] of Object.entries(FIELD_ALIASES) as Array<[SpendImportCanonicalField, string[]]>) {
      if (aliases.includes(normalized)) {
        mapping[sourceColumn] = targetField
        break
      }
    }
  }

  return mapping
}

export function getMissingRequiredSpendMappingFields(
  mapping: Record<string, SpendImportCanonicalField>,
): SpendImportCanonicalField[] {
  const mappedFields = new Set(Object.values(mapping))
  return SPEND_IMPORT_REQUIRED_FIELDS.filter((field) => !mappedFields.has(field))
}

export function applySpendImportMapping(
  raw: Record<string, string>,
  mapping: Record<string, SpendImportCanonicalField>,
): Partial<Record<SpendImportCanonicalField, string>> {
  const values: Partial<Record<SpendImportCanonicalField, string>> = {}
  for (const [sourceColumn, targetField] of Object.entries(mapping)) {
    const value = raw[sourceColumn]
    if (value === undefined) continue
    values[targetField] = value.trim()
  }
  return values
}

export function parseSpendImportMoney(value: string): number | null {
  const normalized = value.trim().replace(/[$,\s]/g, "")
  if (!normalized) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) return null
  return amount
}

export function parseSpendImportDate(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function validateSpendImportRow(
  values: Partial<Record<SpendImportCanonicalField, string>>,
  rowNumber: number,
): SpendImportIssue[] {
  const issues: SpendImportIssue[] = []

  const supplier = values.supplier_name?.trim() ?? ""
  if (!supplier) {
    issues.push({
      rowNumber,
      field: "supplier_name",
      code: "required",
      severity: "error",
      message: "Supplier name is required.",
    })
  }

  const amountRaw = values.amount?.trim() ?? ""
  const amount = parseSpendImportMoney(amountRaw)
  if (amount === null) {
    issues.push({
      rowNumber,
      field: "amount",
      code: "invalid_amount",
      severity: "error",
      message: "Amount must be a valid number.",
    })
  } else if (Math.abs(amount) === 0) {
    issues.push({
      rowNumber,
      field: "amount",
      code: "zero_amount",
      severity: "warning",
      message: "Amount is zero and may not represent an actionable expense.",
    })
  }

  const dateRaw = values.transaction_date?.trim() ?? ""
  if (parseSpendImportDate(dateRaw) === null) {
    issues.push({
      rowNumber,
      field: "transaction_date",
      code: "invalid_date",
      severity: "error",
      message: "Transaction date must be a valid date.",
    })
  }

  const sourceType = (values.source_type ?? "").trim().toLowerCase()
  if (sourceType && !["bill", "transaction"].includes(sourceType)) {
    issues.push({
      rowNumber,
      field: "source_type",
      code: "unknown_source_type",
      severity: "warning",
      message: "Source type should be bill or transaction; defaulting to bill.",
    })
  }

  return issues
}
