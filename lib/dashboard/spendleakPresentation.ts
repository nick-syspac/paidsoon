import type { SpendInsight } from "@/lib/generated/prisma/client"

export const SPENDLEAK_STALE_THRESHOLD_HOURS = 24

export const SPENDLEAK_STALE_COPY = {
  stalePrefix: "Spend data may be stale.",
  staleSuffix: "Refresh your accounting sync to update findings.",
  initialSync: "SpendLeak is connected but has not completed the first sync yet.",
  noConnection: "Connect Xero or MYOB to start SpendLeak insights.",
} as const

export const SPENDLEAK_TOTAL_SOURCE_COUNT = 3

export type SpendLeakModuleId =
  | "recurring_spend"
  | "duplicate_spend"
  | "renewals"
  | "supplier_concentration"
  | "cash_pressure"

export type SpendLeakSeverity = "green" | "yellow" | "red"

export interface SpendLeakModuleSummary {
  id: SpendLeakModuleId
  title: string
  description: string
  findingCount: number
  estimatedAnnualCents: number
  severity: SpendLeakSeverity
}

export type SpendLeakDashboardState = "no_connection" | "initial_sync" | "partial_data" | "stale_data" | "empty" | "ready"

export interface SpendLeakDashboardStatus {
  state: SpendLeakDashboardState
  title: string
  description: string
}

export interface SpendLeakEvidenceField {
  label: string
  value: string
}

export interface SpendLeakEvidenceSection {
  title: string
  description: string
  fields: SpendLeakEvidenceField[]
}

export interface SpendLeakEvidenceView {
  sourceSummary: SpendLeakEvidenceField[]
  sections: SpendLeakEvidenceSection[]
  rawEvidence: SpendLeakEvidenceField[]
}

export type SpendLeakEvidenceSource = "expense_import" | "xero" | "myob" | "unknown"

const MODULE_METADATA: Record<SpendLeakModuleId, { title: string; description: string }> = {
  recurring_spend: {
    title: "Recurring spend",
    description: "Subscriptions and repeat expenses that look ongoing.",
  },
  duplicate_spend: {
    title: "Duplicate spend",
    description: "Potential duplicate invoices or payments to review.",
  },
  renewals: {
    title: "Renewals",
    description: "Upcoming renewal risk and timing-sensitive contracts.",
  },
  supplier_concentration: {
    title: "Supplier concentration",
    description: "Suppliers with outsized spend concentration risk.",
  },
  cash_pressure: {
    title: "Cash pressure",
    description: "Near-term pressure and runway risk indicators.",
  },
}

function normalizeFindingType(value: string): string {
  return value.trim().toLowerCase()
}

export function moduleFromFindingType(findingType: string): SpendLeakModuleId {
  const normalized = normalizeFindingType(findingType)
  if (normalized.includes("duplicate")) return "duplicate_spend"
  if (normalized.includes("renewal")) return "renewals"
  if (normalized.includes("supplier")) return "supplier_concentration"
  if (normalized.includes("cash") || normalized.includes("runway") || normalized.includes("pressure")) {
    return "cash_pressure"
  }
  return "recurring_spend"
}

function rankSeverity(severity: string): number {
  const normalized = severity.trim().toLowerCase()
  if (normalized === "high") return 3
  if (normalized === "medium") return 2
  if (normalized === "low") return 1
  return 0
}

function toDashboardSeverity(maxRank: number): SpendLeakSeverity {
  if (maxRank >= 3) return "red"
  if (maxRank >= 2) return "yellow"
  return "green"
}

export function buildSpendLeakModuleSummaries(findings: SpendInsight[]): SpendLeakModuleSummary[] {
  const grouped: Record<SpendLeakModuleId, SpendInsight[]> = {
    recurring_spend: [],
    duplicate_spend: [],
    renewals: [],
    supplier_concentration: [],
    cash_pressure: [],
  }

  for (const finding of findings) {
    grouped[moduleFromFindingType(finding.findingType)].push(finding)
  }

  return (Object.keys(grouped) as SpendLeakModuleId[]).map((id) => {
    const rows = grouped[id]
    const maxRank = rows.reduce((max, finding) => Math.max(max, rankSeverity(finding.severity)), 0)
    const estimatedAnnualCents = rows.reduce((sum, finding) => sum + (finding.estimatedAnnualCents ?? 0), 0)
    return {
      id,
      title: MODULE_METADATA[id].title,
      description: MODULE_METADATA[id].description,
      findingCount: rows.length,
      estimatedAnnualCents,
      severity: toDashboardSeverity(maxRank),
    }
  })
}

export function isSpendLeakDataStale(
  latestSyncAt: Date | null,
  now: Date = new Date(),
  thresholdHours: number = SPENDLEAK_STALE_THRESHOLD_HOURS,
): boolean {
  if (!latestSyncAt) return false
  const ageMs = now.getTime() - latestSyncAt.getTime()
  return ageMs > thresholdHours * 60 * 60 * 1000
}

function formatAudCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatPercentage(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

function formatDateLabel(value: string | Date | null | undefined): string {
  if (!value) return "Not available"
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString("en-AU")
}

function formatRawEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return "Not available"
  if (typeof value === "string") return value
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Not available"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (value instanceof Date) return formatDateLabel(value)
  if (Array.isArray(value)) return value.map((item) => formatRawEvidenceValue(item)).join(", ") || "Not available"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function toEvidenceObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return { value }
}

export function getSpendLeakEvidenceSource(finding: Pick<SpendInsight, "evidence">): SpendLeakEvidenceSource {
  const evidence = toEvidenceObject(finding.evidence)
  const rawSource = evidence.source
  if (typeof rawSource !== "string") return "unknown"
  const normalized = rawSource.trim().toLowerCase()
  if (normalized === "expense_import") return "expense_import"
  if (normalized === "xero") return "xero"
  if (normalized === "myob") return "myob"
  return "unknown"
}

export function formatSpendLeakEvidenceSource(source: SpendLeakEvidenceSource): string {
  if (source === "expense_import") return "Expense import"
  if (source === "xero") return "Xero sync"
  if (source === "myob") return "MYOB sync"
  return "Unspecified source"
}

export function formatSpendLeakReviewAction(action: string | null | undefined): string {
  if (!action) return "Not reviewed"
  if (action === "keep") return "Keep"
  if (action === "cancel") return "Cancel"
  if (action === "renegotiate") return "Renegotiate"
  if (action === "ignore") return "Ignore"
  return action
}

function buildRawEvidenceFields(evidence: unknown): SpendLeakEvidenceField[] {
  const objectEvidence = toEvidenceObject(evidence)
  const entries = Object.entries(objectEvidence)
  if (entries.length === 0) {
    return [{ label: "Value", value: "Not available" }]
  }
  return entries.map(([key, value]) => ({
    label: key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " "),
    value: formatRawEvidenceValue(value),
  }))
}

function labelKey(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")
}

function findingTypeLabel(findingType: string): string {
  return labelKey(findingType)
}

export function buildSpendLeakDashboardStatus({
  findingsCount,
  hasAccountingConnection,
  latestSyncAt,
  sourceSyncCount,
  now = new Date(),
}: {
  findingsCount: number
  hasAccountingConnection: boolean
  latestSyncAt: Date | null
  sourceSyncCount: number
  now?: Date
}): SpendLeakDashboardStatus {
  if (!hasAccountingConnection) {
    return {
      state: "no_connection",
      title: "Connect accounting sources",
      description: SPENDLEAK_STALE_COPY.noConnection,
    }
  }

  if (sourceSyncCount === 0) {
    return {
      state: "initial_sync",
      title: "Initial sync pending",
      description: SPENDLEAK_STALE_COPY.initialSync,
    }
  }

  if (isSpendLeakDataStale(latestSyncAt, now)) {
    return {
      state: "stale_data",
      title: "Spend data may be stale",
      description: latestSyncAt
        ? `${SPENDLEAK_STALE_COPY.stalePrefix} Last synced ${latestSyncAt.toLocaleString("en-AU")}. ${SPENDLEAK_STALE_COPY.staleSuffix}`
        : `${SPENDLEAK_STALE_COPY.stalePrefix} ${SPENDLEAK_STALE_COPY.staleSuffix}`,
    }
  }

  if (sourceSyncCount < SPENDLEAK_TOTAL_SOURCE_COUNT) {
    return {
      state: "partial_data",
      title: "Partial spend data",
      description: `Only ${sourceSyncCount} of ${SPENDLEAK_TOTAL_SOURCE_COUNT} spend sources have completed a sync, so some modules may be incomplete.`,
    }
  }

  if (findingsCount === 0) {
    return {
      state: "empty",
      title: "No spend findings yet",
      description: "All connected spend sources have synced, but SpendLeak has not identified a supported opportunity yet.",
    }
  }

  return {
    state: "ready",
    title: "SpendLeak ready",
    description: "Spend data is current and SpendLeak findings are available.",
  }
}

export function buildSpendLeakEvidenceView(finding: Pick<SpendInsight, "findingType" | "subjectKey" | "summary" | "evidence" | "detectedAt" | "createdAt" | "updatedAt" | "estimatedMonthlyCents" | "estimatedAnnualCents" | "reviewAction" | "reviewActionAt" | "reviewNote">): SpendLeakEvidenceView {
  const evidence = toEvidenceObject(finding.evidence)
  const source = getSpendLeakEvidenceSource(finding)
  const sourceSummary: SpendLeakEvidenceField[] = [
    { label: "Finding type", value: findingTypeLabel(finding.findingType) },
    { label: "Evidence source", value: formatSpendLeakEvidenceSource(source) },
    { label: "Subject", value: finding.subjectKey || "Not available" },
    { label: "Detected", value: formatDateLabel(finding.detectedAt) },
    { label: "Created", value: formatDateLabel(finding.createdAt) },
    { label: "Updated", value: formatDateLabel(finding.updatedAt) },
  ]

  if (finding.reviewAction) {
    sourceSummary.push({ label: "Review outcome", value: formatSpendLeakReviewAction(finding.reviewAction) })
  }

  if (finding.reviewActionAt) {
    sourceSummary.push({ label: "Reviewed", value: formatDateLabel(finding.reviewActionAt) })
  }

  if (finding.reviewNote) {
    sourceSummary.push({ label: "Decision note", value: finding.reviewNote })
  }

  if (finding.estimatedMonthlyCents !== null && finding.estimatedMonthlyCents !== undefined) {
    sourceSummary.push({ label: "Estimated monthly impact", value: formatAudCurrency(finding.estimatedMonthlyCents) })
  }

  if (finding.estimatedAnnualCents !== null && finding.estimatedAnnualCents !== undefined) {
    sourceSummary.push({ label: "Estimated annual impact", value: formatAudCurrency(finding.estimatedAnnualCents) })
  }

  const sections: SpendLeakEvidenceSection[] = []

  if (finding.findingType.includes("duplicate")) {
    const billIds = Array.isArray(evidence.billIds) ? evidence.billIds.map((item) => formatRawEvidenceValue(item)).join(" · ") : "Not available"
    const amountCents = typeof evidence.amountCents === "number" ? formatAudCurrency(evidence.amountCents) : "Not available"
    const dayDifference = typeof evidence.dayDifference === "number" ? `${Math.round(evidence.dayDifference)} days apart` : "Not available"

    sections.push({
      title: "Duplicate comparison",
      description: finding.summary,
      fields: [
        { label: "Supplier", value: formatRawEvidenceValue(evidence.supplier) },
        { label: "Bill references", value: billIds },
        { label: "Amount", value: amountCents },
        { label: "Gap", value: dayDifference },
      ],
    })
  } else if (finding.findingType.includes("renewal")) {
    sections.push({
      title: "Renewal timeline",
      description: finding.summary,
      fields: [
        { label: "Supplier", value: formatRawEvidenceValue(evidence.supplier) },
        { label: "Renewal date", value: formatDateLabel(evidence.renewalDate as string | Date | null | undefined) },
        { label: "Supporting bills", value: formatRawEvidenceValue(evidence.measuredBills) },
      ],
    })
  } else if (finding.findingType.includes("supplier")) {
    sections.push({
      title: "Concentration snapshot",
      description: finding.summary,
      fields: [
        { label: "Supplier", value: formatRawEvidenceValue(evidence.supplier) },
        { label: "Share of spend", value: typeof evidence.share === "number" ? formatPercentage(evidence.share) : "Not available" },
        { label: "Spend used in calculation", value: typeof evidence.spendCents === "number" ? formatAudCurrency(evidence.spendCents) : "Not available" },
      ],
    })
  } else if (finding.findingType.includes("cash")) {
    sections.push({
      title: "Cash pressure snapshot",
      description: finding.summary,
      fields: [
        { label: "Negative bank outflow", value: typeof evidence.negativeBankTransactionCents === "number" ? formatAudCurrency(evidence.negativeBankTransactionCents) : "Not available" },
        { label: "Spend used in calculation", value: typeof evidence.spendCents === "number" ? formatAudCurrency(evidence.spendCents) : "Not available" },
        { label: "Transaction count", value: typeof evidence.transactionCount === "number" ? String(evidence.transactionCount) : "Not available" },
      ],
    })
  } else {
    sections.push({
      title: "Recurring pattern",
      description: finding.summary,
      fields: [
        { label: "Supplier", value: formatRawEvidenceValue(evidence.supplier) },
        { label: "Bill count", value: typeof evidence.billCount === "number" ? String(evidence.billCount) : "Not available" },
        { label: "Average monthly amount", value: typeof evidence.averageAmountCents === "number" ? formatAudCurrency(evidence.averageAmountCents) : "Not available" },
      ],
    })
  }

  sections.push({
    title: "Rationale",
    description: "The finding summary explains why SpendLeak flagged this record.",
    fields: [{ label: "Why it was flagged", value: finding.summary }],
  })

  return {
    sourceSummary,
    sections,
    rawEvidence: buildRawEvidenceFields(evidence),
  }
}

export function formatAudCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}
