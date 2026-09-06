import Link from "next/link"
import { redirect } from "next/navigation"

import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"

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

export default async function CostGuardCategoriesPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const alerts = await withUserContext(user.id, async (tx) =>
    tx.costGuardAlert.findMany({
      where: { userId: user.id },
      orderBy: { detectedAt: "desc" },
      take: 10,
    }),
  )

  const summaryCards = [
    { label: "Category signals", value: String(alerts.length), note: "Tracked across your spend categories" },
    { label: "Highest variance", value: formatCurrencyCents(Math.max(...alerts.map((alert) => Math.abs(alert.varianceAmountCents)), 0)), note: "Largest category gap from baseline" },
    { label: "Actionable", value: String(alerts.filter((alert) => alert.status !== "resolved").length), note: "Not yet resolved or ignored" },
    { label: "Average movement", value: alerts.length ? formatPercent(alerts.reduce((sum, alert) => sum + alert.variancePercent, 0) / alerts.length) : "0%", note: "Across active category alerts" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
        <p className="text-sm text-gray-600">Track which spend categories are growing faster than expected.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900">{card.value}</p>
            <p className="mt-2 text-xs text-gray-600">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">This month</th>
              <th className="px-4 py-3 font-medium">Typical</th>
              <th className="px-4 py-3 font-medium">Variance</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-600">No category alerts yet. Once category variance crosses the materiality threshold, it will show here.</td>
              </tr>
            ) : (
              alerts.map((alert) => (
                <tr key={alert.id} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {alert.categoryId ? (
                      <Link href={`/dashboard/cost-guard/categories/${alert.categoryId}`} className="hover:text-blue-700">{alert.alertType}</Link>
                    ) : (
                      <span>{alert.alertType}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{formatCurrencyCents(alert.actualAmountCents)}</td>
                  <td className="px-4 py-3">{formatCurrencyCents(alert.baselineAmountCents)}</td>
                  <td className="px-4 py-3 text-amber-700">{formatPercent(alert.variancePercent)}</td>
                  <td className="px-4 py-3">{alert.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
