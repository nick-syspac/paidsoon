import { redirect } from "next/navigation"

import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import {
  buildCashPlanForecast,
  buildCashPlanSummaryResponse,
  defaultCashPlanSettings,
  type CashPlanForecastWeek,
} from "@/lib/cashplan/engine"
import { buildCashPlanDashboardStatus } from "@/lib/dashboard/cashPlanStatus"

function formatAmountFromCents(value: number | null | undefined) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format((value ?? 0) / 100)
}

export default async function CashPlanSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const { plan, settings, summary } = await withUserContext(user.id, async (tx) => {
    const [plan, settings] = await Promise.all([
      tx.cashPlan.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          currency: true,
          timezone: true,
          horizonWeeks: true,
          bufferTargetCents: true,
          status: true,
          updatedAt: true,
        },
      }),
      tx.cashPlanSetting.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          currency: true,
          timezone: true,
          horizonWeeks: true,
          bufferTargetCents: true,
          alertThresholdCents: true,
          reviewRole: true,
        },
      }),
    ])

    const latestSnapshot = plan
      ? await tx.cashPlanSnapshot.findFirst({
          where: { planId: plan.id },
          orderBy: { createdAt: "desc" },
          select: {
            inputHash: true,
            engineVersion: true,
            confidence: true,
            status: true,
            lowestClosingCashCents: true,
            bufferGapCents: true,
            weeks: true,
          },
        })
      : null

    const bufferTargetCents = settings?.bufferTargetCents ?? plan?.bufferTargetCents ?? defaultCashPlanSettings.bufferTargetCents

    const forecast = latestSnapshot && Array.isArray(latestSnapshot.weeks)
      ? {
          engineVersion: latestSnapshot.engineVersion,
          inputHash: latestSnapshot.inputHash,
          confidence: latestSnapshot.confidence,
          status: (latestSnapshot.status === "healthy" || latestSnapshot.status === "preliminary" || latestSnapshot.status === "stale"
            ? latestSnapshot.status
            : "preliminary") as "healthy" | "preliminary" | "stale",
          lowestClosingCashCents: latestSnapshot.lowestClosingCashCents,
          bufferGapCents: latestSnapshot.bufferGapCents,
          dataQualityIssues: [],
          inflows: [],
          outflows: [],
          weeks: latestSnapshot.weeks as unknown as CashPlanForecastWeek[],
        }
      : buildCashPlanForecast({
          openingCashCents: 0,
          inflows: [],
          outflows: [],
          bufferTargetCents,
          now: new Date(),
        })

    const summary = buildCashPlanSummaryResponse({
      forecast,
      title: plan?.name ?? "Base plan",
    })

    return {
      plan,
      settings,
      summary,
    }
  })

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
            <dd className="mt-1 text-sm text-gray-900">{formatAmountFromCents(settings?.bufferTargetCents ?? plan?.bufferTargetCents ?? defaultCashPlanSettings.bufferTargetCents)}</dd>
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
