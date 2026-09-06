import { buildCostGuardForecastSummary, type ForecastSummary } from "@/lib/costGuard/foundation"

export interface FinancialOperationsSummaryInput {
  activeInvoiceCount: number
  spendFindingCount: number
  hasSpendLeakAccess: boolean
  hasAccountingConnection: boolean
  latestSyncAt: Date | null
  costGuardForecast?: ForecastSummary | null
}

export interface FinancialOperationsSummaryModel {
  activeInvoiceCount: number
  spendFindingCount: number
  spendStatusLabel: string
  showUnlockCta: boolean
  costGuardStatusLabel?: string
  costGuardForecastStatus?: "on_track" | "watch" | "over_target"
  costGuardForecastMessage?: string
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
  }
}
