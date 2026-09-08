import { redirect } from "next/navigation"

import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getSubscriptionTier } from "@/lib/billing"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { getTaxBufferSettings, loadTaxBufferSummary, listTaxBufferObligations } from "@/lib/taxBuffer/service"
import Link from "next/link"

function formatAudCents(cents: number | null): string {
  if (cents === null) return "Not enough data"
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function statusClasses(status: string): string {
  if (status === "healthy") return "bg-emerald-100 text-emerald-700"
  if (status === "watch") return "bg-amber-100 text-amber-700"
  if (status === "underfunded") return "bg-orange-100 text-orange-700"
  if (status === "critical") return "bg-red-100 text-red-700"
  return "bg-slate-100 text-slate-700"
}

export default async function TaxBufferPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!hasPlanFeature(tier, "tax_buffer_basic")) {
    redirect("/dashboard?intent=tax_buffer")
  }

  const summary = await loadTaxBufferSummary(user.id)
  const settings = await getTaxBufferSettings(user.id)

  const obligationsResult = await listTaxBufferObligations({ userId: user.id, horizonDays: 90 })
  const obligations = obligationsResult.obligations

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Tax Buffer</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tax Buffer provides planning estimates based on your available financial data. It is not tax, accounting, or financial advice.
        </p>
      </div>

      {!settings.configuration?.enabled ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-900">Finish setup to unlock reliable safe-to-spend numbers</h2>
          <p className="mt-1 text-sm text-blue-800">
            Tax Buffer is currently in setup mode. Review your reserve categories and baseline settings to improve estimate quality.
          </p>
          <div className="mt-3">
            <Link
              href="/dashboard/settings/tax-buffer"
              className="inline-flex rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Open Tax Buffer setup
            </Link>
          </div>
        </section>
      ) : null}

      {summary.warnings.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Data quality warning</h2>
          <ul className="mt-2 space-y-1 text-xs text-amber-800">
            {summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Available cash</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(summary.availableCashCents)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Recommended Tax Buffer</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(summary.totalRequiredReserveCents)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Current Tax Reserve</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(summary.totalReservedCents)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Safe to spend</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(summary.safeToSpendCents)}</p>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Tax Buffer health</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">Reserve gap {formatAudCents(summary.reserveGapCents)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClasses(summary.healthStatus)}`}>
            {summary.healthStatus}
          </span>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-900">
            Recommended action: transfer {formatAudCents(summary.recommendation.transferNowCents)} this week
          </p>
          <p className="mt-1 text-xs text-gray-600">Weekly reserve target: {formatAudCents(summary.recommendation.weeklyTargetCents)}</p>
          {summary.recommendation.reasons.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-gray-700">
              {summary.recommendation.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Breakdown by tax type</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {summary.categories.map((category) => (
            <div key={category.categoryId} className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-900">{category.name}</p>
              <p className="mt-1 text-xs text-gray-600">Required: {formatAudCents(category.requiredReserveCents)}</p>
              <p className="text-xs text-gray-600">Reserved: {formatAudCents(category.reservedCents)}</p>
              <p className="text-xs text-gray-600">Shortfall: {formatAudCents(category.shortfallCents)}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-500">{category.source} · {category.confidence} confidence</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Upcoming obligations (90 days)</h2>
        {obligations.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No obligations currently configured for the selected horizon.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Obligation</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2">Estimated</th>
                  <th className="px-2 py-2">Reserved</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {obligations.map((obligation) => (
                  <tr key={obligation.id} className="border-b border-gray-100">
                    <td className="px-2 py-2">{obligation.name}</td>
                    <td className="px-2 py-2">{new Date(obligation.dueDate).toLocaleDateString("en-AU")}</td>
                    <td className="px-2 py-2">{formatAudCents(obligation.estimatedAmountCents)}</td>
                    <td className="px-2 py-2">{formatAudCents(obligation.reservedAmountCents)}</td>
                    <td className="px-2 py-2">{obligation.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
