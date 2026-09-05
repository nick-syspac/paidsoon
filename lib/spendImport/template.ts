export const SPEND_IMPORT_TEMPLATE_VERSION = "spend-import-v1"

export const SPEND_IMPORT_CANONICAL_FIELDS = [
  "expense_id",
  "source_type",
  "supplier_name",
  "description",
  "reference",
  "amount",
  "currency",
  "transaction_date",
  "due_date",
  "status",
  "account_code",
  "account_name",
] as const

export type SpendImportCanonicalField = (typeof SPEND_IMPORT_CANONICAL_FIELDS)[number]

const SAMPLE_ROWS: Record<SpendImportCanonicalField, string>[] = [
  {
    expense_id: "EXP-1001",
    source_type: "manual",
    supplier_name: "Acme Office Supplies",
    description: "Printer paper and toner",
    reference: "INV-8891",
    amount: "249.90",
    currency: "AUD",
    transaction_date: "2026-08-01",
    due_date: "2026-08-31",
    status: "approved",
    account_code: "610",
    account_name: "Office expenses",
  },
  {
    expense_id: "EXP-1002",
    source_type: "manual",
    supplier_name: "Harbour Freight Couriers",
    description: "Same-day parcel delivery",
    reference: "REF-445",
    amount: "89.00",
    currency: "AUD",
    transaction_date: "2026-08-12",
    due_date: "",
    status: "paid",
    account_code: "620",
    account_name: "Delivery and freight",
  },
]

const CANONICAL_FIELD_SET = new Set<string>(SPEND_IMPORT_CANONICAL_FIELDS)

export function isSpendImportCanonicalField(value: string): value is SpendImportCanonicalField {
  return CANONICAL_FIELD_SET.has(value)
}

export const SPEND_IMPORT_REQUIRED_FIELDS: readonly SpendImportCanonicalField[] = [
  "supplier_name",
  "amount",
  "transaction_date",
]

function csvEscape(value: string): string {
  const escaped = value.replace(/\r?\n/g, " ")
  if (/[",]/.test(escaped)) {
    return `"${escaped.replace(/"/g, '""')}"`
  }
  return escaped
}

export function buildSpendImportCsvTemplateContent(): string {
  const header = SPEND_IMPORT_CANONICAL_FIELDS.join(",")
  const rows = SAMPLE_ROWS.map((row) =>
    SPEND_IMPORT_CANONICAL_FIELDS.map((field) => csvEscape(row[field] ?? "")).join(","),
  )

  return [header, ...rows].join("\n") + "\n"
}
