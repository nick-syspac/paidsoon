import type { SpendInsight } from "@/lib/generated/prisma/client"

export const SPENDLEAK_STALE_THRESHOLD_HOURS = 24

export const SPENDLEAK_STALE_COPY = {
  stalePrefix: "Spend data may be stale.",
  staleSuffix: "Refresh your accounting sync to update findings.",
  initialSync: "SpendLeak is connected but has not completed the first sync yet.",
  noConnection: "Connect Xero or MYOB to start SpendLeak insights.",
} as const

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

export function formatAudCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}
