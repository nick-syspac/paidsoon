import type { CashWaitingSummary as CashWaitingSummaryData } from "@/lib/dashboard/ageing"
import { formatCents } from "@/lib/dashboard/format"

const ROWS: { key: keyof Omit<CashWaitingSummaryData, "outstanding">; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "d1to30", label: "1–30 days" },
  { key: "d31to60", label: "31–60 days" },
  { key: "d60plus", label: "60+ days" },
]

export function CashWaitingSummary({
  summary,
  currency = "usd",
}: {
  summary: CashWaitingSummaryData
  currency?: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-600">Cash Waiting to Be Collected</h2>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCents(summary.outstanding, currency)}</p>
      <dl className="mt-4 space-y-2">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-center justify-between text-sm">
            <dt className="text-gray-500">{row.label}</dt>
            <dd className="font-medium text-gray-900">{formatCents(summary[row.key], currency)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
