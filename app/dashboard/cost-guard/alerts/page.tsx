import Link from "next/link"
import { redirect } from "next/navigation"

import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"

const STATUS_FILTERS = [
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "investigating", label: "Investigating" },
  { value: "expected", label: "Expected" },
  { value: "snoozed", label: "Snoozed" },
  { value: "resolved", label: "Resolved" },
] as const

function formatCurrencyCents(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value / 100)
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${Math.round(value)}%`
}

function SeverityBadge({ severity }: { severity: string }) {
  const classes: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    watch: "bg-yellow-100 text-yellow-700",
    info: "bg-blue-100 text-blue-700",
  }

  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${classes[severity] ?? "bg-gray-100 text-gray-700"}`}>{severity}</span>
}

export default async function CostGuardAlertsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const alerts = await withUserContext(user.id, async (tx) =>
    tx.costGuardAlert.findMany({
      where: { userId: user.id },
      orderBy: { detectedAt: "desc" },
      take: 20,
    }),
  )

  const statusSummary = STATUS_FILTERS.map((status) => ({
    ...status,
    count: alerts.filter((alert) => alert.status === status.value).length,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Cost Guard Alerts</h2>
          <p className="text-sm text-gray-600">Review unusual costs, spending increases and potential overspend.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusSummary.map((filter) => (
          <span
            key={filter.value}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              filter.value === "new"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {filter.label}
            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px]">{filter.count}</span>
          </span>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Alert</th>
                <th className="px-4 py-3 font-medium">Impact</th>
                <th className="px-4 py-3 font-medium">Detected</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-600">
                    No alerts detected yet.
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3"><SeverityBadge severity={alert.severity} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/cost-guard/alerts/${alert.id}`} className="font-medium text-gray-900 hover:text-blue-700">
                        {alert.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{formatCurrencyCents(Math.abs(alert.varianceAmountCents))}</div>
                      <div className="text-xs text-gray-500">{formatPercent(alert.variancePercent)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{new Date(alert.detectedAt).toLocaleDateString("en-AU")}</td>
                    <td className="px-4 py-3 text-gray-600">{alert.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
