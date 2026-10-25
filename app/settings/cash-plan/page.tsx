import { redirect } from "next/navigation"

import { getAuthenticatedUser } from "@/lib/supabase/server"
import { defaultCashPlanSettings } from "@/lib/cashplan/engine"
import { loadCashPlan, presentCashPlan } from "@/lib/cashplan/service"
import { buildCashPlanDashboardStatus } from "@/lib/dashboard/cashPlanStatus"

function formatAmountFromCents(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "Not available"
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100)
}

export default async function CashPlanSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const assembly = await loadCashPlan(user.id)
  const { plan, settings } = assembly.inputs
  const summary = presentCashPlan(assembly)

  const status = buildCashPlanDashboardStatus({ summary, hasPlan: Boolean(plan) })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Cash Plan settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Review the latest cash flow confidence, buffer health, and the settings currently driving the automated forecast.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">{status.title}</p>
          <p className="mt-2 text-sm text-gray-600">{status.summaryLabel}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Confidence</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">{status.confidenceLabel}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Lowest cash</p>
          <p className="mt-2 text-lg font-semibold text-gray-900">{status.lowestCashLabel}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Current plan settings</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Plan name</dt>
            <dd className="mt-1 text-sm text-gray-900">{plan?.name ?? "Base plan"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Currency</dt>
            <dd className="mt-1 text-sm text-gray-900">{(settings?.currency ?? plan?.currency ?? defaultCashPlanSettings.currency).toUpperCase()}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Timezone</dt>
            <dd className="mt-1 text-sm text-gray-900">{settings?.timezone ?? plan?.timezone ?? defaultCashPlanSettings.timezone}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Horizon</dt>
            <dd className="mt-1 text-sm text-gray-900">{settings?.horizonWeeks ?? plan?.horizonWeeks ?? defaultCashPlanSettings.horizonWeeks} weeks</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Buffer target</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatAmountFromCents(assembly.inputs.configuration?.bufferTargetCents, summary.currency ?? "AUD")}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Review role</dt>
            <dd className="mt-1 text-sm text-gray-900">{settings?.reviewRole ?? "owner"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Recommended actions</h3>
        {status.recommendedActions.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm text-gray-700">
            {status.recommendedActions.map((action) => (
              <li key={action} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-600" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-600">No immediate actions are recommended for the current forecast.</p>
        )}
      </div>
    </div>
  )
}
