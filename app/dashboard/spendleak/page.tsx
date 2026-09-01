import { redirect } from "next/navigation"
import Link from "next/link"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import { loadSpendLeakDashboard } from "@/lib/dashboard/loadSpendLeakDashboard"
import { SPENDLEAK_STALE_COPY, type SpendLeakModuleId } from "@/lib/dashboard/spendleakPresentation"
import { SpendLeakModuleGrid } from "@/components/dashboard/spendleak/SpendLeakModuleGrid"
import { SpendLeakFindingsTable } from "@/components/dashboard/spendleak/SpendLeakFindingsTable"

const MODULE_IDS: ReadonlySet<SpendLeakModuleId> = new Set([
  "recurring_spend",
  "duplicate_spend",
  "renewals",
  "supplier_concentration",
  "cash_pressure",
])

function parseModuleFilter(value: string | undefined): SpendLeakModuleId | null {
  if (!value) return null
  return MODULE_IDS.has(value as SpendLeakModuleId) ? (value as SpendLeakModuleId) : null
}

export default async function SpendLeakDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>
}) {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const profile = await getDashboardProfile(user.id)
  if (!canAccessSpendLeak(profile?.subscriptionTier)) {
    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-900">SpendLeak</h1>
        <p className="text-sm text-amber-900">
          SpendLeak is currently available on selected tiers. Upgrade to access spend-side insights.
        </p>
        <Link
          href="/dashboard/settings/subscription?intent=spendleak"
          className="inline-flex rounded-md bg-amber-700 px-3 py-1.5 text-sm text-white hover:bg-amber-800"
        >
          View plans
        </Link>
      </div>
    )
  }

  const [{ module }, data] = await Promise.all([searchParams, loadSpendLeakDashboard(user.id)])
  const selectedModule = parseModuleFilter(module)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">SpendLeak</h1>
        <p className="mt-1 text-sm text-gray-600">Spend-side risks and savings opportunities from your connected accounting data.</p>
      </div>

      {!data.hasAccountingConnection && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          {SPENDLEAK_STALE_COPY.noConnection}
        </div>
      )}

      {data.hasAccountingConnection && !data.latestSyncAt && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          {SPENDLEAK_STALE_COPY.initialSync}
        </div>
      )}

      {data.latestSyncAt && (
        <div className={`rounded-lg border p-4 text-sm ${data.isStale ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          Last synced {data.latestSyncAt.toLocaleString("en-AU")}
          {data.isStale ? ` · ${SPENDLEAK_STALE_COPY.stalePrefix} ${SPENDLEAK_STALE_COPY.staleSuffix}` : " · Data is fresh."}
        </div>
      )}

      <SpendLeakModuleGrid modules={data.modules} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Findings</h2>
          {selectedModule && (
            <Link href="/dashboard/spendleak" className="text-sm text-blue-700 hover:text-blue-800 hover:underline">
              Clear filter
            </Link>
          )}
        </div>
        <SpendLeakFindingsTable findings={data.findings} selectedModule={selectedModule} />
      </section>
    </div>
  )
}
