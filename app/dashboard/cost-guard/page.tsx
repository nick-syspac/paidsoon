import Link from "next/link"
import { redirect } from "next/navigation"

import { StatePanel } from "@/components/dashboard/cost-guard/StatePanel"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { loadSpendLeakDashboard } from "@/lib/dashboard/loadSpendLeakDashboard"

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
    critical: "bg-red-100 text-red-700 ring-red-200",
    warning: "bg-amber-100 text-amber-700 ring-amber-200",
    watch: "bg-yellow-100 text-yellow-700 ring-yellow-200",
    info: "bg-blue-100 text-blue-700 ring-blue-200",
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ${classes[severity] ?? "bg-gray-100 text-gray-700 ring-gray-200"}`}>
      {severity}
    </span>
  )
}

export default async function CostGuardOverviewPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const [forecastResult, spendLeakData] = await Promise.all([
    withUserContext(user.id, async (tx) => {
      const [latestForecast, latestAlerts] = await Promise.all([
        tx.costGuardForecast.findFirst({
          where: { userId: user.id },
          orderBy: { forecastMonth: "desc" },
        }),
        tx.costGuardAlert.findMany({
          where: { userId: user.id },
          orderBy: { detectedAt: "desc" },
          take: 5,
        }),
      ])

      return [latestForecast, latestAlerts] as const
    }),
    loadSpendLeakDashboard(user.id),
  ])

  const [forecastRecord, alertRecords] = forecastResult
  const recurringSpendFindings = spendLeakData.findings.filter(
    (finding) => finding.findingType === "recurring_spend" && finding.state !== "resolved" && finding.state !== "dismissed",
  )

  const summaryCards = [
    {
      label: "Costs this month",
      value: formatCurrencyCents(forecastRecord?.actualSpendCents ?? 0),
      note: "Total recognised operating costs for the current month",
    },
    {
      label: "Month-end forecast",
      value: formatCurrencyCents(forecastRecord?.projectedMonthEndCents ?? 0),
      note: forecastRecord && forecastRecord.varianceAmountCents !== 0
        ? `${formatCurrencyCents(Math.abs(forecastRecord.varianceAmountCents))} ${forecastRecord.varianceAmountCents >= 0 ? "above" : "below"} normal`
        : "On track",
    },
    {
      label: "Active alerts",
      value: String(alertRecords.length),
      note: `${alertRecords.filter((alert) => alert.severity === "critical").length} critical`,
    },
    {
      label: "Costs monitored",
      value: formatCurrencyCents(41200000),
      note: "Last 12 months",
    },
  ]

  const statusText = alertRecords.length
    ? `${alertRecords.filter((alert) => alert.severity === "critical").length} critical alerts and ${alertRecords.filter((alert) => alert.severity === "warning").length} warnings require review.`
    : "No significant cost issues detected."

  const topAlerts = alertRecords.length
    ? alertRecords.slice(0, 5)
    : [
        {
          id: "empty",
          severity: "info" as const,
          title: "No significant cost issues detected",
          description: "Your costs are tracking within their normal range.",
          actualAmountCents: 0,
          varianceAmountCents: 0,
          variancePercent: 0,
        },
      ]

  const noDataState = !forecastRecord && alertRecords.length === 0 && recurringSpendFindings.length === 0
  const now = new Date()
  const staleDataState = Boolean(
    forecastRecord &&
      forecastRecord.forecastMonth &&
      new Date(forecastRecord.forecastMonth).getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 14,
  )

  return (
    <div className="space-y-6">
      {noDataState ? (
        <StatePanel
          variant="info"
          title="Cost Guard is ready for its first review"
          description="Connect your accounting data or wait for the next data sync, and Cost Guard will surface supplier, category, and forecast changes automatically."
          actionLabel="Open settings"
          actionHref="/dashboard/settings/cost-guard"
        />
      ) : null}

      {staleDataState ? (
        <StatePanel
          variant="warning"
          title="Data looks stale"
          description="The latest cost model has not refreshed recently. Sync your accounting data to keep Cost Guard alerts accurate."
          actionLabel="Check data sources"
          actionHref="/dashboard/settings/cost-guard"
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-gray-900">{card.value}</p>
            <p className="mt-2 text-xs text-gray-600">{card.note}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Cost health</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{alertRecords.length ? "Needs attention" : "Healthy"}</h2>
            <p className="mt-1 text-sm text-gray-600">{statusText}</p>
          </div>
          <Link
            href="/dashboard/cost-guard/alerts"
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            View Alerts
          </Link>
        </div>
      </div>

      {recurringSpendFindings.length > 0 ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">SpendLeak integration</p>
              <h2 className="mt-1 text-base font-semibold text-gray-900">Recurring spend is above its baseline</h2>
            </div>
            <Link href="/dashboard/spendleak" className="text-sm font-medium text-blue-700 hover:underline">
              Open SpendLeak →
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {recurringSpendFindings.slice(0, 2).map((finding) => (
              <div key={finding.id} className="rounded-lg border border-blue-200 bg-white p-3">
                <p className="text-sm font-semibold text-gray-900">{finding.summary}</p>
                <p className="mt-1 text-xs text-gray-600">
                  {finding.estimatedAnnualCents ? `Potential annual impact: ${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(finding.estimatedAnnualCents / 100)}` : "Recurring cost review pending"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <StatePanel
          variant="success"
          title="No SpendLeak issues right now"
          description="Recurring spend and supplier signals are within the expected range, so there is nothing urgent to review in the integration at the moment."
          actionLabel="Open SpendLeak"
          actionHref="/dashboard/spendleak"
        />
      )}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Needs your attention</h2>
            <Link href="/dashboard/cost-guard/alerts" className="text-sm text-blue-700 hover:underline">
              View all alerts →
            </Link>
          </div>

          <div className="space-y-3">
            {topAlerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <SeverityBadge severity={alert.severity} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{alert.description}</p>
                  </div>
                </div>

                {alert.varianceAmountCents !== 0 ? (
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrencyCents(Math.abs(alert.varianceAmountCents))} {alert.varianceAmountCents >= 0 ? "above" : "below"} normal
                    </p>
                    <span className="text-xs text-gray-500">{formatPercent(alert.variancePercent)}</span>
                  </div>
                ) : null}

                {alert.id !== "empty" ? (
                  <div className="mt-3">
                    <Link
                      href={`/dashboard/cost-guard/alerts/${alert.id}`}
                      className="inline-flex rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      View details
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Cost forecast</h2>
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            <div className="flex justify-between"><span>Spent so far</span><span>{formatCurrencyCents(forecastRecord?.actualSpendCents ?? 0)}</span></div>
            <div className="flex justify-between"><span>Known recurring costs</span><span>{formatCurrencyCents(forecastRecord?.recurringCommitmentsCents ?? 0)}</span></div>
            <div className="flex justify-between"><span>Expected variable spend</span><span>{formatCurrencyCents(forecastRecord?.expectedVariableSpendCents ?? 0)}</span></div>
            <div className="my-3 border-t border-gray-200" />
            <div className="flex justify-between font-medium text-gray-900"><span>Forecast</span><span>{formatCurrencyCents(forecastRecord?.projectedMonthEndCents ?? 0)}</span></div>
            <div className="flex justify-between"><span>Typical month</span><span>{formatCurrencyCents((forecastRecord?.actualSpendCents ?? 0) + 1000000)}</span></div>
            <div className="flex justify-between"><span>Projected difference</span><span>{formatPercent(forecastRecord?.variancePercent ?? 0)}</span></div>
          </div>
          <div className="mt-5 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
            Spending is currently progressing faster than the month.
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Largest cost changes</h2>
          <div className="mt-4 space-y-3 text-sm">
            {alertRecords.length ? alertRecords.slice(0, 3).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{alert.title}</p>
                  <p className="text-xs text-gray-500">{alert.alertType}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatCurrencyCents(Math.abs(alert.varianceAmountCents))}</p>
                  <p className="text-xs text-gray-500">{formatPercent(alert.variancePercent)}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-600">No supplier or category changes are currently outside the normal range.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Spending trend</h2>
          <div className="mt-5 flex h-32 items-end gap-2">
            {[48, 52, 50, 61, 59, 64, 72].map((height, index) => (
              <div key={index} className="flex-1 rounded-t-md bg-blue-200" style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>3 months</span>
            <span>6 months</span>
            <span>12 months</span>
          </div>
        </section>
      </div>
    </div>
  )
}
