import * as XLSX from "xlsx"

import {
  getMarginCustomers,
  getMarginSummary,
  listMarginAlerts,
  listMarginOpportunities,
  type MarginPeriodPreset,
} from "@/lib/marginguard/service"

export type MarginGuardExportDataset = "summary" | "customers" | "alerts" | "opportunities"

export interface MarginGuardExportQuery {
  userId: string
  dataset: MarginGuardExportDataset
  period?: MarginPeriodPreset
}

export const MARGIN_GUARD_EXPORT_ROW_CEILING = 50_000

export class MarginGuardExportRowLimitExceededError extends Error {
  constructor(public readonly rowCount: number, public readonly limit: number) {
    super(`Export matched ${rowCount} rows, which exceeds the ${limit}-row export limit. Narrow your filter and try again.`)
    this.name = "MarginGuardExportRowLimitExceededError"
  }
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return ""
  return value.toFixed(2)
}

function formatCurrencyCents(value: number | null): string {
  if (value === null || Number.isNaN(value)) return ""
  return (value / 100).toFixed(2)
}

function toDatasetLabel(dataset: MarginGuardExportDataset): string {
  if (dataset === "summary") return "summary"
  if (dataset === "customers") return "customers"
  if (dataset === "alerts") return "alerts"
  return "opportunities"
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function withBom(content: string): string {
  return "\uFEFF" + content
}

function buildRowsHeader(dataset: MarginGuardExportDataset): string[] {
  if (dataset === "summary") {
    return [
      "period_preset",
      "period_from",
      "period_to",
      "status",
      "confidence",
      "gross_margin_percent",
      "target_gross_margin_percent",
      "margin_variance_percent",
      "gross_profit",
      "margin_at_risk",
      "alerts_open",
      "customers_below_target",
      "completeness_percent",
    ]
  }

  if (dataset === "customers") {
    return [
      "customer_id",
      "customer_name",
      "revenue",
      "paid",
      "gross_profit",
      "gross_margin_percent",
      "target_margin_percent",
      "variance_percent",
      "status",
      "outstanding_invoices",
    ]
  }

  if (dataset === "alerts") {
    return [
      "alert_id",
      "alert_type",
      "scope_type",
      "scope_key",
      "severity",
      "status",
      "title",
      "message",
      "detected_at",
      "updated_at",
    ]
  }

  return [
    "opportunity_id",
    "opportunity_type",
    "scope_type",
    "scope_key",
    "severity",
    "status",
    "title",
    "description",
    "estimated_monthly",
    "estimated_annual",
    "confidence",
    "detected_at",
    "resolved_at",
  ]
}

async function loadDatasetRows(query: MarginGuardExportQuery): Promise<string[][]> {
  if (query.dataset === "summary") {
    const summary = await getMarginSummary(query.userId, query.period)
    return [[
      summary.period.preset,
      summary.period.from,
      summary.period.to,
      summary.status,
      summary.confidence,
      formatPercent(summary.grossMarginPercent),
      formatPercent(summary.targetGrossMarginPercent),
      formatPercent(summary.marginVariancePercent),
      formatCurrencyCents(summary.grossProfitCents),
      formatCurrencyCents(summary.marginAtRiskCents),
      String(summary.alertsOpenCount),
      String(summary.customersBelowTargetCount),
      formatPercent(summary.completenessPercent),
    ]]
  }

  if (query.dataset === "customers") {
    const customers = await getMarginCustomers(query.userId, query.period)
    return customers.map((row) => [
      row.customerId,
      row.customerName,
      formatCurrencyCents(row.revenueCents),
      formatCurrencyCents(row.paidCents),
      formatCurrencyCents(row.grossProfitCents),
      formatPercent(row.grossMarginPercent),
      formatPercent(row.targetMarginPercent),
      formatPercent(row.variancePercent),
      row.status,
      String(row.outstandingInvoicesCount),
    ])
  }

  if (query.dataset === "alerts") {
    const alerts = await listMarginAlerts(query.userId)
    return alerts.map((row) => [
      row.id,
      row.alertType,
      row.scopeType,
      row.scopeKey ?? "",
      row.severity,
      row.status,
      row.title,
      row.message,
      row.detectedAt.toISOString(),
      row.updatedAt.toISOString(),
    ])
  }

  const opportunities = await listMarginOpportunities(query.userId)
  return opportunities.map((row) => [
    row.id,
    row.opportunityType,
    row.scopeType,
    row.scopeKey ?? "",
    row.severity,
    row.status,
    row.title,
    row.description,
    formatCurrencyCents(row.estimatedMonthlyCents),
    formatCurrencyCents(row.estimatedAnnualCents),
    row.confidence,
    row.detectedAt.toISOString(),
    row.resolvedAt?.toISOString() ?? "",
  ])
}

export async function loadMarginGuardExport(query: MarginGuardExportQuery): Promise<{ header: string[]; rows: string[][] }> {
  const header = buildRowsHeader(query.dataset)
  const rows = await loadDatasetRows(query)

  if (rows.length > MARGIN_GUARD_EXPORT_ROW_CEILING) {
    throw new MarginGuardExportRowLimitExceededError(rows.length, MARGIN_GUARD_EXPORT_ROW_CEILING)
  }

  return { header, rows }
}

export function generateMarginGuardExportCsv(payload: { header: string[]; rows: string[][] }): string {
  const header = payload.header.map(escapeCsvField).join(",")
  const lines = payload.rows.map((row) => row.map((cell) => escapeCsvField(cell)).join(","))
  return withBom([header, ...lines].join("\r\n") + "\r\n")
}

export function generateMarginGuardExportXlsx(payload: { header: string[]; rows: string[][] }, dataset: MarginGuardExportDataset): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([payload.header, ...payload.rows])
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: payload.header.length - 1 } }),
  }
  sheet["!cols"] = payload.header.map((field) => ({ wch: Math.max(field.length + 2, 18) }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, `MarginGuard ${toDatasetLabel(dataset)}`)

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true })
}

export function buildMarginGuardExportFilename(dataset: MarginGuardExportDataset, format: "csv" | "xlsx", now: Date = new Date()): string {
  const datePart = now.toISOString().slice(0, 10)
  return `paidsoon-marginguard-${toDatasetLabel(dataset)}-${datePart}.${format}`
}
