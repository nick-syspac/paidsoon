import * as XLSX from "xlsx"

import {
  formatSpendLeakEvidenceSource,
  formatSpendLeakReviewAction,
  getSpendLeakEvidenceSource,
} from "@/lib/dashboard/spendleakPresentation"
import type { SpendInsight } from "@/lib/generated/prisma/client"
import {
  SPENDLEAK_EXPORT_FIELDS,
  type SpendLeakExportFieldKey,
  type SpendLeakExportRow,
} from "@/lib/spendleak/exportFields"

/** Above this many rows, export fails with an actionable error. */
export const SPENDLEAK_EXPORT_ROW_CEILING = 50_000

export class SpendLeakExportRowLimitExceededError extends Error {
  constructor(public readonly rowCount: number, public readonly limit: number) {
    super(`Export matched ${rowCount} rows, which exceeds the ${limit}-row export limit. Narrow your filter and try again.`)
    this.name = "SpendLeakExportRowLimitExceededError"
  }
}

function toEvidenceObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== "string" || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function asCentsToDollars(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value / 100
}

function fromMoneyEvidence(evidence: Record<string, unknown>): number | null {
  return asCentsToDollars(
    evidence.amountCents
      ?? evidence.averageAmountCents
      ?? evidence.currentAverageCents
      ?? evidence.latestAmountCents
      ?? evidence.spendCents
      ?? evidence.negativeBankTransactionCents,
  )
}

function frequencyFromFinding(finding: Pick<SpendInsight, "findingType">): string {
  if (finding.findingType === "recurring_spend") return "monthly"
  if (finding.findingType === "renewal") return "annual_or_term"
  if (finding.findingType === "price_increase" || finding.findingType === "supplier_spend_trend") return "trend"
  if (finding.findingType === "duplicate_spend" || finding.findingType === "duplicate_payment") return "possible_duplicate"
  return "review"
}

function statusForFinding(finding: Pick<SpendInsight, "state" | "reviewAction">): string {
  if (finding.reviewAction === "keep" || finding.reviewAction === "cancel" || finding.reviewAction === "renegotiate") {
    return finding.reviewAction
  }
  if (finding.reviewAction === "ignore") return "review"
  if (finding.state === "open" || finding.state === "snoozed") return "review"
  return "review"
}

function sourceReferenceFromEvidence(evidence: Record<string, unknown>): string {
  const direct = asString(evidence.reference)
    || asString(evidence.documentNumber)
    || asString(evidence.sourceId)
  if (direct) return direct

  const billIds = Array.isArray(evidence.billIds)
    ? evidence.billIds.map((value) => asString(value)).filter(Boolean)
    : []
  if (billIds.length > 0) return billIds.join(" | ")

  const txnIds = Array.isArray(evidence.transactionIds)
    ? evidence.transactionIds.map((value) => asString(value)).filter(Boolean)
    : []
  if (txnIds.length > 0) return txnIds.join(" | ")

  return ""
}

function supplierOrCounterpartyFromEvidence(evidence: Record<string, unknown>, subjectKey: string): string {
  return asString(evidence.supplier)
    || asString(evidence.counterparty)
    || asString(evidence.counterpartyName)
    || subjectKey
}

function transactionDateFromEvidence(evidence: Record<string, unknown>): Date | null {
  return asDate(evidence.transactionDate)
    ?? asDate(evidence.renewalDate)
    ?? asDate(evidence.dueDate)
    ?? null
}

function findingDescription(evidence: Record<string, unknown>, summary: string): string {
  return asString(evidence.description) || summary
}

function categoryFromEvidence(evidence: Record<string, unknown>): string {
  return asString(evidence.account_name)
    || asString(evidence.accountName)
    || asString(evidence.expenseAccountName)
    || asString(evidence.account_code)
    || asString(evidence.accountCode)
}

function confidenceFromEvidence(evidence: Record<string, unknown>): string {
  return asString(evidence.confidence)
}

export function buildSpendLeakExportRow(finding: SpendInsight): SpendLeakExportRow {
  const evidence = toEvidenceObject(finding.evidence)

  const monthlyCost = finding.estimatedMonthlyCents !== null && finding.estimatedMonthlyCents !== undefined
    ? finding.estimatedMonthlyCents / 100
    : null
  const annualCost = finding.estimatedAnnualCents !== null && finding.estimatedAnnualCents !== undefined
    ? finding.estimatedAnnualCents / 100
    : null

  return {
    finding_type: finding.findingType,
    supplier_or_counterparty: supplierOrCounterpartyFromEvidence(evidence, finding.subjectKey),
    description: findingDescription(evidence, finding.summary),
    expense_category: categoryFromEvidence(evidence),
    transaction_amount: fromMoneyEvidence(evidence),
    transaction_date: transactionDateFromEvidence(evidence),
    detected_frequency: frequencyFromFinding(finding),
    monthly_cost: monthlyCost,
    annualised_cost: annualCost,
    potential_annual_saving: annualCost,
    spendleak_status: statusForFinding(finding),
    owner_notes: finding.reviewNote?.trim() ?? "",
    detection_confidence: confidenceFromEvidence(evidence),
    source_transaction_reference: sourceReferenceFromEvidence(evidence),
    evidence_source: formatSpendLeakEvidenceSource(getSpendLeakEvidenceSource(finding)),
    detected_at: finding.detectedAt,
  }
}

export function sanitiseFormulaValue(value: string): string {
  if (/^[=+\-@]/.test(value.trim())) return `'${value}`
  return value
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function cellText(field: SpendLeakExportFieldKey, row: SpendLeakExportRow): string {
  const fieldDef = SPENDLEAK_EXPORT_FIELDS.find((entry) => entry.key === field)
  if (!fieldDef) return ""
  const value = row[field]
  if (value === null || value === undefined) return ""

  if (value instanceof Date) {
    return formatDate(value)
  }

  if (typeof value === "number") {
    return value.toFixed(2)
  }

  const text = value
  return fieldDef.sanitise ? sanitiseFormulaValue(text) : text
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const UTF8_BOM = "\uFEFF"

export function generateSpendLeakExportCsv(findings: SpendInsight[]): string {
  if (findings.length > SPENDLEAK_EXPORT_ROW_CEILING) {
    throw new SpendLeakExportRowLimitExceededError(findings.length, SPENDLEAK_EXPORT_ROW_CEILING)
  }

  const header = SPENDLEAK_EXPORT_FIELDS.map((field) => csvField(field.header)).join(",")
  const lines = findings.map((finding) => {
    const row = buildSpendLeakExportRow(finding)
    return SPENDLEAK_EXPORT_FIELDS.map((field) => csvField(cellText(field.key, row))).join(",")
  })

  return UTF8_BOM + [header, ...lines].join("\r\n") + "\r\n"
}

export function generateSpendLeakExportXlsx(findings: SpendInsight[]): Buffer {
  if (findings.length > SPENDLEAK_EXPORT_ROW_CEILING) {
    throw new SpendLeakExportRowLimitExceededError(findings.length, SPENDLEAK_EXPORT_ROW_CEILING)
  }

  const header = SPENDLEAK_EXPORT_FIELDS.map((field) => field.header)
  const sheet = XLSX.utils.aoa_to_sheet([header])

  findings.forEach((finding, rowIndex) => {
    const row = buildSpendLeakExportRow(finding)

    SPENDLEAK_EXPORT_FIELDS.forEach((field, colIndex) => {
      const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex })
      const value = row[field.key]
      if (value === null || value === undefined || value === "") return

      if (value instanceof Date) {
        sheet[address] = { t: "d", v: value, z: "yyyy-mm-dd" }
        return
      }

      if (typeof value === "number") {
        sheet[address] = { t: "n", v: value, z: "#,##0.00" }
        return
      }

      sheet[address] = { t: "s", v: field.sanitise ? sanitiseFormulaValue(value) : value }
    })
  })

  const rowCount = findings.length + 1
  const colCount = SPENDLEAK_EXPORT_FIELDS.length
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowCount - 1, c: colCount - 1 } })
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }) }
  sheet["!cols"] = SPENDLEAK_EXPORT_FIELDS.map((field) => ({
    wch: Math.max(field.header.length + 2, field.type === "string" ? 26 : 16),
  }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "SpendLeak Report")

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true })
}

export function buildSpendLeakExportFilename(format: "csv" | "xlsx", now: Date = new Date()): string {
  const datePart = now.toISOString().slice(0, 10)
  return `paidsoon-spendleak-report-${datePart}.${format}`
}

export function formatSpendLeakReviewOutcome(action: string | null | undefined): string {
  return formatSpendLeakReviewAction(action)
}
