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

export default async function CategoryDetailPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const [categoryAlerts, categoryBaseline] = await Promise.all([
    withUserContext(user.id, (tx) =>
      tx.costGuardAlert.findMany({
        where: { userId: user.id, categoryId },
        orderBy: { detectedAt: "desc" },
        take: 8,
      }),
    ),
    withUserContext(user.id, (tx) =>
      tx.costGuardBaseline.findFirst({
        where: { userId: user.id, baselineType: "category", categoryId },
        orderBy: { calculatedAt: "desc" },
      }),
    ),
  ])

  const totalVariance = categoryAlerts.reduce((sum, alert) => sum + alert.varianceAmountCents, 0)
  const currentMonthSpend = categoryAlerts.reduce((sum, alert) => sum + alert.actualAmountCents, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Category detail</p>
          <h2 className="mt-2 text-2xl font-semibold text-gray-900">{categoryId}</h2>
        </div>
        <Link href="/dashboard/cost-guard/categories" className="text-sm text-blue-700 hover:underline">
          Back to categories
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Spend this month</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(currentMonthSpend)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Typical spend</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(categoryBaseline?.averageAmountCents ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Variance</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(Math.abs(totalVariance))}</p>
          <p className="mt-1 text-sm text-gray-600">{categoryAlerts.length ? formatPercent(categoryAlerts.reduce((sum, alert) => sum + alert.variancePercent, 0) / categoryAlerts.length) : "0%"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Category movement</h3>
        <div className="mt-4 space-y-3">
          {categoryAlerts.length === 0 ? (
            <p className="text-sm text-gray-600">No category drift has been observed for this spend group yet.</p>
          ) : (
            categoryAlerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{alert.title}</p>
                    <p className="text-xs text-gray-500">{new Date(alert.detectedAt).toLocaleDateString("en-AU")}</p>
                  </div>
                  <Link href={`/dashboard/cost-guard/alerts/${alert.id}`} className="text-sm font-medium text-blue-700 hover:underline">
                    View alert
                  </Link>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-gray-700">
                  <span>Actual: {formatCurrencyCents(alert.actualAmountCents)}</span>
                  <span>Typical: {formatCurrencyCents(alert.baselineAmountCents)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
