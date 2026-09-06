import { redirect } from "next/navigation"

import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"

export default async function CostGuardSettingsPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const settings = await withUserContext(user.id, async (tx) =>
    tx.costGuardSetting.findUnique({
      where: { userId: user.id },
      select: {
        materialityPercent: true,
        materialityCents: true,
        alertDigestMode: true,
        defaultLookbackDays: true,
      },
    }),
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Cost Guard settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Tune how aggressively PaidSoon flags unusual spending and how often review digests are sent.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Alert sensitivity</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{settings?.materialityPercent ?? 20}%</p>
          <p className="mt-2 text-sm text-gray-600">Normal threshold before a cost change is treated as material.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Minimum materiality</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">A${(settings?.materialityCents ?? 10000) / 100}</p>
          <p className="mt-2 text-sm text-gray-600">Small changes below this level are masked to reduce noise.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Baseline lookback</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{settings?.defaultLookbackDays ?? 180} days</p>
          <p className="mt-2 text-sm text-gray-600">Period used to measure a supplier or category against its normal spend.</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Digest frequency</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900 capitalize">{settings?.alertDigestMode ?? "daily"}</p>
          <p className="mt-2 text-sm text-gray-600">How often the summary email or digest should be sent.</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-base font-semibold text-gray-900">Current behaviour</h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          <li>• New supplier detection remains enabled by default.</li>
          <li>• Alert thresholds use a blended percentage and absolute-value trigger.</li>
          <li>• Critical or warning alerts are surfaced in the main dashboard and notification centre.</li>
        </ul>
      </div>
    </div>
  )
}
