export interface FinancialOperationsSummaryInput {
  activeInvoiceCount: number
  spendFindingCount: number
  hasSpendLeakAccess: boolean
  hasAccountingConnection: boolean
  latestSyncAt: Date | null
}

export interface FinancialOperationsSummaryModel {
  activeInvoiceCount: number
  spendFindingCount: number
  spendStatusLabel: string
  showUnlockCta: boolean
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

  return {
    activeInvoiceCount: input.activeInvoiceCount,
    spendFindingCount: input.hasSpendLeakAccess ? input.spendFindingCount : 0,
    spendStatusLabel,
    showUnlockCta: !input.hasSpendLeakAccess,
  }
}
