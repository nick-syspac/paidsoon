import type { CashPlanSummaryResponse } from "@/lib/cashplan/engine"

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
  summary: CashPlanSummaryResponse
  hasPlan: boolean
}): CashPlanDashboardStatus {
  const { overview } = input.summary
  const status = overview.status

  const statusTextMap = {
    healthy: "Healthy",
    preliminary: "Needs review",
    stale: "Stale data",
  } satisfies Record<"healthy" | "preliminary" | "stale", string>

  const summaryLabel = `${statusTextMap[status]} · ${overview.confidence}% confidence`
  const confidenceLabel = `${Math.max(0, overview.confidence)}% confidence`
  const lowestCashLabel = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Math.abs(overview.lowestClosingCashCents) / 100)

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
