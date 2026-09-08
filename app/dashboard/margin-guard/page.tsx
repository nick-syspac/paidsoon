import Link from "next/link"
import { redirect } from "next/navigation"

import { getSubscriptionTier } from "@/lib/billing"
import { canAccessMarginGuard } from "@/lib/dashboard/marginguardAccess"
import {
  getMarginBreakdowns,
  getMarginCustomers,
  getMarginSummary,
  getMarginTrends,
  listMarginAlerts,
  type MarginPeriodPreset,
} from "@/lib/marginguard/service"
import { getAuthenticatedUser } from "@/lib/supabase/server"

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatPercent(value: number | null): string {
  if (value === null) return "Not available"
  return `${value.toFixed(1)}%`
}

function statusBadge(status: string): string {
  if (status === "healthy") return "bg-emerald-100 text-emerald-800"
  if (status === "watch") return "bg-amber-100 text-amber-800"
  if (status === "warning") return "bg-orange-100 text-orange-800"
  if (status === "critical") return "bg-red-100 text-red-800"
  return "bg-slate-100 text-slate-700"
}

interface TrendPoint {
  periodStart: string
  periodEnd: string
  revenueCents: number
  directCostCents: number
  grossProfitCents: number
  grossMarginPercent: number | null
  targetGrossMarginPercent: number
}

interface TrendResponse {
  points: TrendPoint[]
  comparison: {
    enabled: boolean
    deltaGrossMarginPercent: number | null
    deltaGrossProfitCents: number | null
  }
}

interface AlertRow {
  id: string
  title: string
  severity: string
  message: string
  scopeType: string
  scopeKey: string | null
}

const PERIODS: MarginPeriodPreset[] = ["30d", "3m", "6m", "12m", "fy"]

export default async function MarginGuardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compare?: string }>
}) {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessMarginGuard(tier)) {
    redirect("/dashboard?intent=marginguard")
  }

  const { period, compare } = await searchParams
  const preset = PERIODS.includes(period as MarginPeriodPreset) ? (period as MarginPeriodPreset) : undefined
  const comparisonMode = compare === "previous_period" ? "previous_period" : "none"

  const summary: Awaited<ReturnType<typeof getMarginSummary>> = await getMarginSummary(user.id, preset)
  const trends = (await getMarginTrends(user.id, preset, comparisonMode)) as TrendResponse
  const customerRows: Awaited<ReturnType<typeof getMarginCustomers>> = await getMarginCustomers(user.id, preset)
  const breakdownRows: Awaited<ReturnType<typeof getMarginBreakdowns>> = await getMarginBreakdowns(
    user.id,
    "invoice",
    preset,
  )
  const alerts = (await listMarginAlerts(user.id, "open", 5)) as AlertRow[]

  const invoiceRows: Array<{
    key: string
    label: string
    source: string
    revenueCents: number
    grossMarginPercent: number | null
    status: string
  }> = breakdownRows.map((row) => ({
    ...row,
    source: "source" in row && typeof row.source === "string" ? row.source : row.scopeType,
  }))

  const emptyState = summary.revenueCents <= 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">MarginGuard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Know what is profitable before margin erosion becomes a cash problem.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
          {summary.period.preset.toUpperCase()} window
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => {
          const active = summary.period.preset === p
          return (
            <Link
              key={p}
              href={`/dashboard/margin-guard?period=${p}${comparisonMode === "previous_period" ? "&compare=previous_period" : ""}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                active ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {p.toUpperCase()}
            </Link>
          )
        })}
        <Link
          href={`/dashboard/margin-guard?period=${summary.period.preset}&compare=${comparisonMode === "previous_period" ? "none" : "previous_period"}`}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            comparisonMode === "previous_period"
              ? "bg-slate-900 text-white"
              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
          }`}
        >
          {comparisonMode === "previous_period" ? "Comparison: Previous Period" : "Enable Comparison"}
        </Link>
      </div>

      {emptyState ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-900">MarginGuard needs revenue and cost data</h2>
          <p className="mt-1 text-sm text-blue-800">
            Connect accounting software, import transactions, classify expenses, and set target margins before relying on profitability analysis.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/settings/connections" className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800">Connect accounting</Link>
            <Link href="/dashboard/settings/import-export" className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-blue-800 border border-blue-300 hover:bg-blue-100">Import data</Link>
            <Link href="/dashboard/settings/margin-guard" className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-blue-800 border border-blue-300 hover:bg-blue-100">Configure MarginGuard</Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Gross Margin</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatPercent(summary.grossMarginPercent)}</p>
          <p className="mt-1 text-xs text-gray-500">Target {summary.targetGrossMarginPercent.toFixed(1)}%</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Gross Profit</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(summary.grossProfitCents)}</p>
          <p className="mt-1 text-xs text-gray-500">Revenue {formatCurrency(summary.revenueCents)} · Direct cost {formatCurrency(summary.directCostCents)}</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Margin At Risk</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(summary.marginAtRiskCents)}</p>
          <p className="mt-1 text-xs text-gray-500">Based on warning threshold gap and current revenue basis</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Customers Below Target</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.customersBelowTargetCount}</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Margin Alerts</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.alertsOpenCount}</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Margin Data</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{summary.completenessPercent.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-gray-500">Confidence: {summary.confidence.replace("_", " ")}</p>
        </article>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Margin trend</h2>
        {comparisonMode === "previous_period" ? (
          <p className="mt-2 text-xs text-gray-600">
            {trends.comparison.deltaGrossMarginPercent === null
              ? "Comparison enabled. Not enough previous-period snapshots yet."
              : `Previous period delta: ${trends.comparison.deltaGrossMarginPercent >= 0 ? "+" : ""}${trends.comparison.deltaGrossMarginPercent.toFixed(1)} pts · Gross profit ${trends.comparison.deltaGrossProfitCents === null ? "not available" : formatCurrency(trends.comparison.deltaGrossProfitCents)}`}
          </p>
        ) : null}
        <div className="mt-4 space-y-2">
          {trends.points.map((point) => (
            <div key={`${point.periodStart}:${point.periodEnd}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>{new Date(point.periodStart).toLocaleDateString("en-AU")}</span>
                <span>{formatPercent(point.grossMarginPercent)}</span>
              </div>
              <div className="h-2 w-full rounded bg-gray-100">
                <div
                  className="h-2 rounded bg-blue-600"
                  style={{ width: `${Math.max(0, Math.min(100, point.grossMarginPercent ?? 0))}%` }}
                />
                <div
                  className="relative -top-2 h-2 border-t-2 border-dashed border-emerald-500"
                  style={{ width: `${Math.max(0, Math.min(100, point.targetGrossMarginPercent ?? 0))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>Margin {formatPercent(point.grossMarginPercent)}</span>
                <span>Target {formatPercent(point.targetGrossMarginPercent)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Needs attention</h2>
        {alerts.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No active MarginGuard alerts for this period.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {alerts.map((alert) => (
              <article key={alert.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${statusBadge(alert.severity === "critical" ? "critical" : "warning")}`}>{alert.severity}</span>
                </div>
                <p className="mt-1 text-sm text-gray-700">{alert.message}</p>
                <p className="mt-1 text-xs text-gray-500">{alert.scopeType}{alert.scopeKey ? ` · ${alert.scopeKey}` : ""}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 overflow-x-auto">
        <h2 className="text-base font-semibold text-gray-900">Customer profitability</h2>
        <table className="mt-3 min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-2 py-2">Customer</th>
              <th className="px-2 py-2">Revenue</th>
              <th className="px-2 py-2">Profit</th>
              <th className="px-2 py-2">Margin</th>
              <th className="px-2 py-2">Target</th>
              <th className="px-2 py-2">Outstanding</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {customerRows.slice(0, 10).map((row) => (
              <tr key={row.customerId} className="border-b border-gray-100">
                <td className="px-2 py-2 text-gray-900">{row.customerName}</td>
                <td className="px-2 py-2">{formatCurrency(row.revenueCents)}</td>
                <td className="px-2 py-2">{formatCurrency(row.grossProfitCents)}</td>
                <td className="px-2 py-2">{formatPercent(row.grossMarginPercent)}</td>
                <td className="px-2 py-2">{row.targetMarginPercent.toFixed(1)}%</td>
                <td className="px-2 py-2">{row.outstandingInvoicesCount}</td>
                <td className="px-2 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${statusBadge(row.status)}`}>
                    {row.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 overflow-x-auto">
        <h2 className="text-base font-semibold text-gray-900">Invoice margin basis</h2>
        <table className="mt-3 min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-2 py-2">Invoice</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Revenue</th>
              <th className="px-2 py-2">Gross margin</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoiceRows.slice(0, 10).map((row) => (
              <tr key={row.key} className="border-b border-gray-100">
                <td className="px-2 py-2 text-gray-900">{row.label}</td>
                <td className="px-2 py-2">{row.source}</td>
                <td className="px-2 py-2">{formatCurrency(row.revenueCents)}</td>
                <td className="px-2 py-2">{formatPercent(row.grossMarginPercent)}</td>
                <td className="px-2 py-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${statusBadge(row.status)}`}>{row.status.replace("_", " ")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Insights</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          <li>
            Margin variance versus target is {summary.marginVariancePercent === null ? "not available" : `${summary.marginVariancePercent.toFixed(1)} percentage points`}.
          </li>
          <li>
            Data completeness is {summary.completenessPercent.toFixed(1)}%, with confidence level {summary.confidence.replace("_", " ")}.
          </li>
          <li>
            {summary.assumptions.missingItems.length === 0
              ? "MarginGuard has enough mapped data for baseline decisions."
              : `Improve confidence by: ${summary.assumptions.missingItems.join("; ")}.`}
          </li>
        </ul>
      </section>
    </div>
  )
}
