import { buildCostGuardForecastSummary, type ForecastSummary } from "@/lib/costGuard/foundation"

export interface FinancialOperationsSummaryInput {
  activeInvoiceCount: number
  spendFindingCount: number
  hasSpendLeakAccess: boolean
  hasAccountingConnection: boolean
  latestSyncAt: Date | null
  costGuardForecast?: ForecastSummary | null
}

export interface FinancialOperationsCard {
  id: "month_spend" | "forecast_variance" | "cost_risks" | "protected_value"
  label: string
  value: string
  description: string
}

export interface FinancialOperationsSummaryModel {
  activeInvoiceCount: number
  spendFindingCount: number
  spendStatusLabel: string
  showUnlockCta: boolean
  costGuardStatusLabel?: string
  costGuardForecastStatus?: "on_track" | "watch" | "over_target"
  costGuardForecastMessage?: string
  monthSpendCents?: number
  forecastVarianceCents?: number
  costRiskCount?: number
  protectedValueCents?: number
  financialOperationCards: FinancialOperationsCard[]
}

export function buildFinancialOperationsSummary(
  input: FinancialOperationsSummaryInput,
): FinancialOperationsSummaryModel {
  const spendStatusLabel = input.hasSpendLeakAccess
    ? input.latestSyncAt
      ? `Synced ${input.latestSyncAt.toLocaleDateString("en-AU")}`
      : input.hasAccountingConnection
      ? "Initial sync pending"
      : "No accounting connection"
    : "Locked"

  const costGuardForecastSummary = input.costGuardForecast ? buildCostGuardForecastSummary(input.costGuardForecast) : null
  const monthSpendCents = input.costGuardForecast?.actualSpendCents ?? 0
  const forecastVarianceCents = input.costGuardForecast?.varianceAmountCents ?? 0
  const costRiskCount = input.spendFindingCount
  const protectedValueCents = Math.max(0, forecastVarianceCents)

  const financialOperationCards: FinancialOperationsCard[] = [
    {
      id: "month_spend",
      label: "Spend this month",
      value: `$${(monthSpendCents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`,
      description: "Current month-to-date spend",
    },
    {
      id: "forecast_variance",
      label: "Forecast variance",
      value: `$${(forecastVarianceCents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`,
      description: costGuardForecastSummary ? costGuardForecastSummary.message : "No drift detected",
    },
    {
      id: "cost_risks",
      label: "Cost risks",
      value: String(costRiskCount),
      description: "Open spend-side findings",
    },
    {
      id: "protected_value",
      label: "Protected value",
      value: `$${(protectedValueCents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`,
      description: "Estimated value protected from drift",
    },
  ]

  return {
    activeInvoiceCount: input.activeInvoiceCount,
    spendFindingCount: input.hasSpendLeakAccess ? input.spendFindingCount : 0,
    spendStatusLabel,
    showUnlockCta: !input.hasSpendLeakAccess,
    costGuardStatusLabel: costGuardForecastSummary
      ? costGuardForecastSummary.status === "over_target"
        ? "Over target"
        : costGuardForecastSummary.status === "watch"
          ? "Watch"
          : "On track"
      : undefined,
    costGuardForecastStatus: costGuardForecastSummary?.status,
    costGuardForecastMessage: costGuardForecastSummary?.message,
    monthSpendCents,
    forecastVarianceCents,
    costRiskCount,
    protectedValueCents,
    financialOperationCards,
  }
}
