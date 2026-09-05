import { redirect } from "next/navigation"
import Link from "next/link"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import { loadSpendLeakDashboard } from "@/lib/dashboard/loadSpendLeakDashboard"
import { type SpendLeakModuleId } from "@/lib/dashboard/spendleakPresentation"
import {
  formatSpendLeakEvidenceSource,
  formatSpendLeakReviewAction,
  getSpendLeakEvidenceSource,
} from "@/lib/dashboard/spendleakPresentation"
import { SpendLeakModuleGrid } from "@/components/dashboard/spendleak/SpendLeakModuleGrid"
import { SpendLeakFindingsTable } from "@/components/dashboard/spendleak/SpendLeakFindingsTable"
import { SpendLeakStatusBanner } from "@/components/dashboard/spendleak/SpendLeakStatusBanner"

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
  const showEmptyState = data.status.state === "empty"
  const reviewedFindings = data.findings.filter((finding) => Boolean(finding.reviewAction))
  const reviewOutcomeSummary = reviewedFindings.reduce<Record<string, number>>((summary, finding) => {
    const key = formatSpendLeakReviewAction(finding.reviewAction)
    summary[key] = (summary[key] ?? 0) + 1
    return summary
  }, {})
  const sourceSummary = data.findings.reduce<Record<string, number>>((summary, finding) => {
    const key = formatSpendLeakEvidenceSource(getSpendLeakEvidenceSource(finding))
    summary[key] = (summary[key] ?? 0) + 1
    return summary
  }, {})
  const sourceSummaryText = Object.entries(sourceSummary)
    .map(([label, count]) => `${count} ${label}`)
    .join(" · ")
  const reviewSummaryText = Object.entries(reviewOutcomeSummary)
    .map(([label, count]) => `${count} ${label}`)
    .join(" · ")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">SpendLeak</h1>
        <p className="mt-1 text-sm text-gray-600">Spend-side risks and savings opportunities from your connected accounting data.</p>
      </div>

      {data.status.state !== "ready" && <SpendLeakStatusBanner status={data.status} />}

      {data.status.state === "ready" && data.latestSyncAt && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Last synced {data.latestSyncAt.toLocaleString("en-AU")} · Data is fresh.
        </div>
      )}

      {showEmptyState && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
          SpendLeak is fully synced, but there are no findings in the current data yet. When the next signal appears, it will show up here without needing a refresh.
        </div>
      )}

      {data.findings.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <p className="font-medium text-gray-900">Evidence coverage</p>
          <p className="mt-1">{sourceSummaryText}</p>
          <p className="mt-3 font-medium text-gray-900">Reviewed outcomes</p>
          <p className="mt-1">{reviewSummaryText || "No review decisions recorded yet."}</p>
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
