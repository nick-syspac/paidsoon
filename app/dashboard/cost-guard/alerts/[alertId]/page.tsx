import { redirect } from "next/navigation"
import Link from "next/link"

import { AlertActionPanel } from "@/components/dashboard/cost-guard/AlertActionPanel"
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

export default async function CostGuardAlertDetailPage({ params }: { params: Promise<{ alertId: string }> }) {
  const { alertId } = await params
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const alert = await withUserContext(user.id, async (tx) =>
    tx.costGuardAlert.findFirst({
      where: { id: alertId, userId: user.id },
    }),
  )

  if (!alert) {
    redirect("/dashboard/cost-guard/alerts")
  }

  const events = await withUserContext(user.id, (tx) =>
    tx.costGuardAlertEvent.findMany({
      where: { alertId: alert.id, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{alert.severity}</p>
          <h2 className="mt-2 text-2xl font-semibold text-gray-900">{alert.title}</h2>
        </div>
        <Link href="/dashboard/cost-guard/alerts" className="text-sm text-blue-700 hover:underline">Back to alerts</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Current</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(alert.actualAmountCents)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Typical</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(alert.baselineAmountCents)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Difference</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrencyCents(Math.abs(alert.varianceAmountCents))}</p>
          <p className="mt-1 text-sm text-gray-600">{formatPercent(alert.variancePercent)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Why Cost Guard flagged this</h3>
        <p className="mt-3 text-sm text-gray-700">{alert.description}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm text-gray-600">
          <div className="rounded-lg bg-gray-50 p-3"><span className="block text-xs uppercase tracking-wide text-gray-500">Baseline period</span> Previous 6 months</div>
          <div className="rounded-lg bg-gray-50 p-3"><span className="block text-xs uppercase tracking-wide text-gray-500">Detection rule</span> {alert.alertType}</div>
          <div className="rounded-lg bg-gray-50 p-3"><span className="block text-xs uppercase tracking-wide text-gray-500">Threshold</span> {formatPercent(alert.variancePercent)} vs normal</div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Transactions contributing to this alert</h3>
        <div className="mt-4 rounded-lg border border-gray-200 text-sm">
          <div className="grid grid-cols-4 bg-gray-50 px-4 py-3 font-medium text-gray-600">
            <span>Date</span>
            <span>Description</span>
            <span>Reference</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="grid grid-cols-4 px-4 py-3 text-gray-700">
            <span>{new Date(alert.detectedAt).toLocaleDateString("en-AU")}</span>
            <span>{alert.alertType}</span>
            <span>{alert.id.slice(0, 8).toUpperCase()}</span>
            <span className="text-right">{formatCurrencyCents(alert.actualAmountCents)}</span>
          </div>
        </div>
      </div>

      <AlertActionPanel alertId={alert.id} currentStatus={alert.status} />

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Audit trail</h3>
        <div className="mt-4 space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-gray-600">No actions have been recorded yet.</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-gray-900">{event.eventType}</span>
                  <span className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString("en-AU")}</span>
                </div>
                <p className="mt-2">{event.reason ?? "Activity logged for this alert."}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
