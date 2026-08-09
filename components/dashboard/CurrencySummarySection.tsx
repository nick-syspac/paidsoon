import { AiSummaryCard } from "@/components/dashboard/AiSummaryCard"
import { AgeingChart } from "@/components/dashboard/AgeingChart"
import { BiggestDebtors } from "@/components/dashboard/BiggestDebtors"
import { CashWaitingSummary } from "@/components/dashboard/CashWaitingSummary"
import { CollectionPerformance } from "@/components/dashboard/CollectionPerformance"
import { TopKpiCards } from "@/components/dashboard/TopKpiCards"
import type { CurrencyDashboardSummary } from "@/lib/dashboard/currencySummary"

export function CurrencySummarySection({
  summary,
  showCurrencyHeading = false,
}: {
  summary: CurrencyDashboardSummary
  showCurrencyHeading?: boolean
}) {
  return (
    <section className="space-y-4">
      {showCurrencyHeading ? (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-600">{summary.currency.toUpperCase()}</h2>
          <span className="text-xs text-gray-400">Currency-specific summary</span>
        </div>
      ) : null}

      <AiSummaryCard lines={summary.aiSummaryLines} />
      <TopKpiCards cards={summary.topKpiCards} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CashWaitingSummary summary={summary.cashWaitingSummary} currency={summary.currency} />
        <AgeingChart buckets={summary.ageingBuckets} currency={summary.currency} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CollectionPerformance performance={summary.collectionPerformance} currency={summary.currency} />
        <BiggestDebtors debtors={summary.biggestDebtors} />
      </div>
    </section>
  )
}
