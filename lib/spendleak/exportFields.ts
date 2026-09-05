export type SpendLeakExportFieldKey =
  | "finding_type"
  | "supplier_or_counterparty"
  | "description"
  | "expense_category"
  | "transaction_amount"
  | "transaction_date"
  | "detected_frequency"
  | "monthly_cost"
  | "annualised_cost"
  | "potential_annual_saving"
  | "spendleak_status"
  | "owner_notes"
  | "detection_confidence"
  | "source_transaction_reference"
  | "evidence_source"
  | "detected_at"

export type SpendLeakExportFieldType = "string" | "currency" | "date"

export interface SpendLeakExportField {
  key: SpendLeakExportFieldKey
  header: string
  type: SpendLeakExportFieldType
  sanitise: boolean
}

export interface SpendLeakExportRow {
  finding_type: string
  supplier_or_counterparty: string
  description: string
  expense_category: string
  transaction_amount: number | null
  transaction_date: Date | null
  detected_frequency: string
  monthly_cost: number | null
  annualised_cost: number | null
  potential_annual_saving: number | null
  spendleak_status: string
  owner_notes: string
  detection_confidence: string
  source_transaction_reference: string
  evidence_source: string
  detected_at: Date
}

export const SPENDLEAK_EXPORT_FIELDS: ReadonlyArray<SpendLeakExportField> = [
  { key: "finding_type", header: "finding_type", type: "string", sanitise: false },
  { key: "supplier_or_counterparty", header: "supplier_or_counterparty", type: "string", sanitise: true },
  { key: "description", header: "description", type: "string", sanitise: true },
  { key: "expense_category", header: "expense_category", type: "string", sanitise: true },
  { key: "transaction_amount", header: "transaction_amount", type: "currency", sanitise: false },
  { key: "transaction_date", header: "transaction_date", type: "date", sanitise: false },
  { key: "detected_frequency", header: "detected_frequency", type: "string", sanitise: false },
  { key: "monthly_cost", header: "monthly_cost", type: "currency", sanitise: false },
  { key: "annualised_cost", header: "annualised_cost", type: "currency", sanitise: false },
  { key: "potential_annual_saving", header: "potential_annual_saving", type: "currency", sanitise: false },
  { key: "spendleak_status", header: "spendleak_status", type: "string", sanitise: false },
  { key: "owner_notes", header: "owner_notes", type: "string", sanitise: true },
  { key: "detection_confidence", header: "detection_confidence", type: "string", sanitise: false },
  { key: "source_transaction_reference", header: "source_transaction_reference", type: "string", sanitise: true },
  { key: "evidence_source", header: "evidence_source", type: "string", sanitise: false },
  { key: "detected_at", header: "detected_at", type: "date", sanitise: false },
]
