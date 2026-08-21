/**
 * Canonical invoice-export data dictionary (openspec/changes/add-invoice-export,
 * design.md § Data Dictionary). CSV and XLSX generation both read column keys,
 * order, and formatting from this single constant so the two formats can
 * never drift out of sync.
 */

export type ExportFieldType = "string" | "date" | "decimal" | "timestamp"

export interface ExportFieldDefinition {
  key: string
  /** Column header text — identical to `key` today, kept distinct in case a
   * future revision wants a different display heading without a data-shape change. */
  header: string
  type: ExportFieldType
  /** True for fields sourced from user-controlled free text — these are the
   * only fields the formula-injection sanitiser is applied to. */
  sanitise: boolean
}

export const EXPORT_FIELDS: readonly ExportFieldDefinition[] = [
  { key: "invoice_reference", header: "invoice_reference", type: "string", sanitise: false },
  { key: "customer_name", header: "customer_name", type: "string", sanitise: true },
  { key: "customer_email", header: "customer_email", type: "string", sanitise: true },
  // Only populated for provider === "spreadsheet_import" rows — see buildExportRow.
  { key: "invoice_date", header: "invoice_date", type: "date", sanitise: false },
  { key: "due_date", header: "due_date", type: "date", sanitise: false },
  { key: "original_amount", header: "original_amount", type: "decimal", sanitise: false },
  { key: "outstanding_balance", header: "outstanding_balance", type: "decimal", sanitise: false },
  { key: "currency", header: "currency", type: "string", sanitise: false },
  { key: "status", header: "status", type: "string", sanitise: false },
  { key: "paid_date", header: "paid_date", type: "date", sanitise: false },
  { key: "promise_to_pay_status", header: "promise_to_pay_status", type: "string", sanitise: false },
  { key: "promise_to_pay_date", header: "promise_to_pay_date", type: "date", sanitise: false },
  { key: "dispute_status", header: "dispute_status", type: "string", sanitise: false },
  { key: "reminder_status", header: "reminder_status", type: "string", sanitise: false },
  { key: "accounting_source", header: "accounting_source", type: "string", sanitise: false },
  { key: "created_at", header: "created_at", type: "timestamp", sanitise: false },
  { key: "updated_at", header: "updated_at", type: "timestamp", sanitise: false },
] as const

export type ExportFieldKey = (typeof EXPORT_FIELDS)[number]["key"]

export const EXPORT_FIELD_KEYS: readonly ExportFieldKey[] = EXPORT_FIELDS.map((field) => field.key)

/** One exported invoice row: every value keyed by its data-dictionary column,
 * already formatted into the final display string/number/Date/null — no
 * further per-format transformation needed beyond CSV/XLSX cell serialisation. */
export type ExportRow = Record<ExportFieldKey, string | number | Date | null>
