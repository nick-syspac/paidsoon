import type { CollectionPerformance as CollectionPerformanceData } from "@/lib/dashboard/collectionMetrics"
import { formatCents } from "@/lib/dashboard/format"

export function CollectionPerformance({
  performance,
  currency = "usd",
}: {
  performance: CollectionPerformanceData
  currency?: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-600">Collection Performance</h2>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">Recovered this week</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatCents(performance.recoveredThisWeek, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Recovered this month</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {formatCents(performance.recoveredThisMonth, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg. reminder-to-payment time</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {performance.averageDaysToPayment != null ? `${performance.averageDaysToPayment} days` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Collection rate</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">
            {performance.collectionRatePercent != null ? `${performance.collectionRatePercent}%` : "—"}
          </p>
        </div>
      </div>
    </div>
  )
}
