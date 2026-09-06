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

export default async function SupplierDetailPage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const [supplierAlerts, supplierForecast] = await Promise.all([
    withUserContext(user.id, (tx) =>
      tx.costGuardAlert.findMany({
        where: { userId: user.id, supplierId },
        orderBy: { detectedAt: "desc" },
        take: 8,
      }),
    ),
    withUserContext(user.id, (tx) =>
      tx.costGuardBaseline.findFirst({
        where: { userId: user.id, baselineType: "supplier", supplierId },
        orderBy: { calculatedAt: "desc" },
      }),
    ),
  ])

  const totalVariance = supplierAlerts.reduce((sum, alert) => sum + alert.varianceAmountCents, 0)
  const currentMonthSpend = supplierAlerts.reduce((sum, alert) => sum + alert.actualAmountCents, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Supplier detail</p>
          <h2 className="mt-2 text-2xl font-semibold text-gray-900">{supplierId}</h2>
        </div>
        <Link href="/dashboard/cost-guard/suppliers" className="text-sm text-blue-700 hover:underline">
          Back to suppliers
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Spend this month</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(currentMonthSpend)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Baseline</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(supplierForecast?.averageAmountCents ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Variance</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(Math.abs(totalVariance))}</p>
          <p className="mt-1 text-sm text-gray-600">{supplierAlerts.length ? formatPercent(supplierAlerts.reduce((sum, alert) => sum + alert.variancePercent, 0) / supplierAlerts.length) : "0%"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Recent supplier activity</h3>
        <div className="mt-4 space-y-3">
          {supplierAlerts.length === 0 ? (
            <p className="text-sm text-gray-600">No recent supplier changes have been detected for this supplier.</p>
          ) : (
            supplierAlerts.map((alert) => (
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
                  <span>Baseline: {formatCurrencyCents(alert.baselineAmountCents)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
