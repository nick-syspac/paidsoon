import Link from "next/link"
import { redirect } from "next/navigation"

import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getSubscriptionTier } from "@/lib/billing"
import { canAccessRunwayGuard } from "@/lib/dashboard/runwayGuardAccess"
import { defaultRunwayGuardPolicy } from "@/lib/runwayGuard/foundation"
import { buildRunwayGuardServiceOutput } from "@/lib/runwayGuard/service"
import { getRunwayGuardSettings } from "@/lib/runwayGuard/settings"

function formatAudCents(cents: number | null): string {
  if (cents === null) return "Not enough data"
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function RunwayGuardPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessRunwayGuard(tier)) {
    redirect("/dashboard?intent=runwayguard")
  }

  const settings = await getRunwayGuardSettings(user.id)
  const hasForecastData = settings?.runwayDays !== null && settings?.availableCashCents !== null
  const runwaySummary = buildRunwayGuardServiceOutput({
    openingCashCents: 1_200_000,
    protectedCashCents: 250_000,
    reserveBufferCents: 75_000,
    committedOutflowsCents: 125_000,
    policy: {
      ...defaultRunwayGuardPolicy,
      horizonDays: settings?.horizonDays ?? defaultRunwayGuardPolicy.horizonDays,
      warningThresholdDays: settings?.warningThresholdDays ?? defaultRunwayGuardPolicy.warningThresholdDays,
      criticalThresholdDays: settings?.criticalThresholdDays ?? defaultRunwayGuardPolicy.criticalThresholdDays,
      minimumConfidence: settings?.minimumConfidence ?? defaultRunwayGuardPolicy.minimumConfidence,
    },
    forecast: [
      { day: 0, projectedCashCents: 1_200_000 },
      { day: 30, projectedCashCents: 900_000 },
      { day: 60, projectedCashCents: 550_000 },
      { day: 90, projectedCashCents: 150_000 },
      { day: 120, projectedCashCents: 0 },
    ],
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">RunwayGuard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Track your projected operating runway, protected cash buffers, and confidence-weighted exhaustion risk.
          </p>
        </div>
        <Link
          href="/dashboard/settings/runway-guard"
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Settings
        </Link>
      </div>

      {!hasForecastData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">RunwayGuard needs a forecast before it can estimate runway risk.</p>
          <p className="mt-1 text-amber-800">
            Add cash-plan data or connect your source data, then return here to see usable cash, runway days, and threshold guidance.
          </p>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Usable cash</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(settings?.availableCashCents ?? null)}</p>
          <p className="mt-1 text-xs text-gray-600">Protected balances are kept outside the operating runway.</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Runway</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{settings?.runwayDays ?? 0} days</p>
          <p className="mt-1 text-xs text-gray-600">Current forecast horizon from your active cash plan.</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Protected cash</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(settings?.protectedCashCents ?? null)}</p>
          <p className="mt-1 text-xs text-gray-600">Tax and reserve buffers are excluded from runway calculations.</p>
        </article>
        <article className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Confidence</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{settings?.confidence ?? "medium"}</p>
          <p className="mt-1 text-xs text-gray-600">Based on inflow quality, missing-data limits, and forecast reliability.</p>
        </article>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Forecast summary</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Projected cash-out</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{runwaySummary.summary.projectedExhaustionDay} days</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Minimum projected cash</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatAudCents(Math.max(0, runwaySummary.summary.usableCashCents))}</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Confidence</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{runwaySummary.summary.confidence.toFixed(2)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{runwaySummary.summary.status}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Key runway drivers</h2>
          <ul className="mt-4 space-y-3 text-sm text-gray-700">
            {runwaySummary.summary.reasons.map((reason) => (
              <li key={reason} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                {reason}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Recommended next actions</h2>
          <ul className="mt-4 space-y-3 text-sm text-gray-700">
            <li className="rounded-lg border border-gray-200 bg-gray-50 p-3">Keep protected cash aligned with the current tax and reserve buffer.</li>
            <li className="rounded-lg border border-gray-200 bg-gray-50 p-3">Review the next 90 days of fixed commitments to extend the runway horizon.</li>
            <li className="rounded-lg border border-gray-200 bg-gray-50 p-3">Raise confidence by resolving disputed receivables and overdue inflows.</li>
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Status and guidance</h2>
        <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-900">Current status: {settings?.status ?? runwaySummary.summary.status}</p>
          <p className="mt-2 text-sm text-gray-600">
            RunwayGuard compares your usable cash against the burn profile and highlights whether cash-out risk is either stable, warning, or critical.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Forecast inputs</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Horizon</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{settings?.horizonDays ?? 90} days</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Warning threshold</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{settings?.warningThresholdDays ?? 60} days</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Critical threshold</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{settings?.criticalThresholdDays ?? 30} days</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Minimum confidence</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{settings?.minimumConfidence ?? 0.7}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
