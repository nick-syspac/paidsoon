import { buildAgeingBuckets, buildCashWaitingSummary, type AgeingBucket, type CashWaitingSummary } from "@/lib/dashboard/ageing"
import { buildAiSummary, type AiSummaryLine } from "@/lib/dashboard/aiSummary"
import { buildBiggestDebtors, type DebtorSummary } from "@/lib/dashboard/biggestDebtors"
import { buildCollectionPerformance, type CollectionPerformance } from "@/lib/dashboard/collectionMetrics"
import { groupDashboardItemsByCurrency } from "@/lib/dashboard/currencyGrouping"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"
import { buildTopKpiCards, type TopKpiCard } from "@/lib/dashboard/topKpiCards"

export interface CurrencyDashboardSummary {
  currency: string
  topKpiCards: TopKpiCard[]
  ageingBuckets: AgeingBucket[]
  cashWaitingSummary: CashWaitingSummary
  biggestDebtors: DebtorSummary[]
  collectionPerformance: CollectionPerformance
  aiSummaryLines: AiSummaryLine[]
}

export function buildCurrencyDashboardSummaries(input: {
  activeInvoices: InvoiceWithRelations[]
  paidInvoices: PaidInvoiceSummary[]
  displayName: string | null
  brokenPromiseCountsByDebtor: Record<string, number>
  paidCountAllTime: number
  manuallyResolvedCountAllTime: number
  now?: Date
}): CurrencyDashboardSummary[] {
  const now = input.now ?? new Date()
  const groupedInvoices = groupDashboardItemsByCurrency(input.activeInvoices, input.paidInvoices)

  return groupedInvoices.map(({ currency, activeItems, paidItems }) => {
    const ageingBuckets = buildAgeingBuckets(activeItems, now)

    return {
      currency,
      topKpiCards: buildTopKpiCards({
        activeInvoices: activeItems,
        paidInvoices: paidItems,
        paidCountAllTime: input.paidCountAllTime,
        manuallyResolvedCountAllTime: input.manuallyResolvedCountAllTime,
        now,
      }),
      ageingBuckets,
      cashWaitingSummary: buildCashWaitingSummary(ageingBuckets),
      biggestDebtors: buildBiggestDebtors(activeItems, now),
      collectionPerformance: buildCollectionPerformance({
        paidInvoices: paidItems,
        paidCountAllTime: input.paidCountAllTime,
        manuallyResolvedCountAllTime: input.manuallyResolvedCountAllTime,
        now,
      }),
      aiSummaryLines: buildAiSummary({
        displayName: input.displayName,
        activeInvoices: activeItems,
        paidInvoices: paidItems,
        brokenPromiseCountsByDebtor: input.brokenPromiseCountsByDebtor,
        now,
      }),
    }
  })
}
