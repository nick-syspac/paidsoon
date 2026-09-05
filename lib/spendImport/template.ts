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

const CANONICAL_FIELD_SET = new Set<string>(SPEND_IMPORT_CANONICAL_FIELDS)

export function isSpendImportCanonicalField(value: string): value is SpendImportCanonicalField {
  return CANONICAL_FIELD_SET.has(value)
}

export const SPEND_IMPORT_REQUIRED_FIELDS: readonly SpendImportCanonicalField[] = [
  "supplier_name",
  "amount",
  "transaction_date",
]
