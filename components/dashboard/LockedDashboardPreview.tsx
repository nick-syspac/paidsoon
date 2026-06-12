import Link from "next/link"
import type { DashboardUpsellModel } from "@/lib/dashboardUpsell"

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function LockedDashboardPreview({ model }: { model: DashboardUpsellModel }) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
        <div className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
          {model.badgeLabel}
        </div>
        <p className="mt-2 text-sm font-medium text-amber-900">{model.title}</p>
        <p className="text-xs text-amber-700 mt-1">{model.description}</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Overdue</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Next action</th>
            </tr>
          </thead>
          <tbody>
            {model.sampleRows.map((row) => (
              <tr key={`${row.clientName}-${row.overdueDays}`} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-3 font-medium text-gray-900">{row.clientName}</td>
                <td className="px-4 py-3 text-gray-700">{formatUsd(row.amountUsd)}</td>
                <td className="px-4 py-3 text-red-600 font-medium">{row.overdueDays}d</td>
                <td className="px-4 py-3 text-gray-600">{row.stageLabel}</td>
                <td className="px-4 py-3 text-gray-600">{row.nextActionLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          {model.nearLimit
            ? "You're close to your current plan limits. Unlock more capacity and richer workflow controls."
            : "Unlock this dashboard to move from sample visibility to real-time control."}
        </p>
        <Link
          href={model.ctaHref}
          className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {model.ctaLabel}
        </Link>
      </div>
    </div>
  )
}
