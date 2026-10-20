import type { CashPlanSummaryResponse } from "@/lib/cashplan/engine"
import type { CashPlanCanonicalSummary } from "@/lib/cashplan/service"

export interface CashPlanDashboardStatus {
  title: string
  status: "healthy" | "preliminary" | "stale"
  summaryLabel: string
  confidenceLabel: string
  lowestCashLabel: string
  freshnessLabel: string
  primaryActionHref: string
  recommendedActions: string[]
}

export function buildCashPlanDashboardStatus(input: {
  summary: CashPlanSummaryResponse | CashPlanCanonicalSummary
  hasPlan: boolean
}): CashPlanDashboardStatus {
  const { overview } = input.summary
  const status = overview.status

  const statusTextMap = {
    healthy: "Healthy",
    preliminary: "Needs review",
    stale: "Stale data",
  } satisfies Record<"healthy" | "preliminary" | "stale", string>

  const unavailable = overview.lowestClosingCashCents === null
  const summaryLabel = unavailable ? "Cash projection unavailable" : `${statusTextMap[status]} · ${overview.confidence}% confidence`
  const confidenceLabel = unavailable ? "Not available" : `${Math.max(0, overview.confidence)}% confidence`
  const lowestCashLabel = unavailable ? "Not available" : new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "currency" in input.summary ? input.summary.currency ?? "AUD" : "AUD",
    maximumFractionDigits: 0,
  }).format(overview.lowestClosingCashCents! / 100)

  return {
    title: overview.title,
    status,
    summaryLabel,
    confidenceLabel,
    lowestCashLabel,
    freshnessLabel: overview.freshnessLabel,
    primaryActionHref: input.hasPlan ? "/dashboard/settings/cash-plan" : "/dashboard/settings",
    recommendedActions: overview.recommendedActions.slice(0, 3),
  }
}
