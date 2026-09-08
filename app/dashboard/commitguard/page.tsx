import Link from "next/link"
import { redirect } from "next/navigation"

import { CommitGuardWorkspace } from "@/components/dashboard/commitguard/CommitGuardWorkspace"
import { getSubscriptionTier } from "@/lib/billing"
import { listDetectedCommitmentCandidates } from "@/lib/commitguard/detection"
import { listCommitments, summarizeCommitGuard } from "@/lib/commitguard/service"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { getAuthenticatedUser } from "@/lib/supabase/server"

function formatAudCents(cents: number | null): string {
  if (cents === null) return "Not available"
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function severityLabel(severity: string): string {
  if (severity === "urgent") return "Urgent"
  if (severity === "action_required") return "Action required"
  if (severity === "watch") return "Watch"
  return "Info"
}

export default async function CommitGuardPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    search?: string
    costGuardAlertId?: string
    sortBy?: string
    sortOrder?: string
    page?: string
  }>
}) {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!hasPlanFeature(tier, "commitguard_core")) {
    redirect("/dashboard?intent=commitguard")
  }

  const params = await searchParams
  const statusFilter = (params.status ?? "").trim().toLowerCase()
  const searchFilter = (params.search ?? "").trim().toLowerCase()
  const costGuardAlertId = (params.costGuardAlertId ?? "").trim()
  const sortBy = (params.sortBy ?? "nextDueDate").trim()
  const sortOrder = (params.sortOrder ?? "asc").trim() === "desc" ? "desc" : "asc"
  const page = Math.max(1, Number(params.page ?? "1") || 1)
  const pageSize = 12

  const [summary, commitments] = await Promise.all([
    summarizeCommitGuard({ userId: user.id, cashAvailableCents: null }),
    listCommitments(user.id),
  ])

  const filtered = commitments
    .filter((commitment) => {
      if (statusFilter && commitment.status !== statusFilter) return false
      if (costGuardAlertId && commitment.linkedCostGuardAlertId !== costGuardAlertId) return false
      if (searchFilter) {
        const text = [commitment.name, commitment.category, commitment.supplierName ?? "", commitment.notes ?? ""]
          .join(" ")
          .toLowerCase()
        if (!text.includes(searchFilter)) return false
      }
      return true
    })
    .sort((left, right) => {
      const direction = sortOrder === "asc" ? 1 : -1
      if (sortBy === "amountCents") {
        return (left.amountCents - right.amountCents) * direction
      }
      if (sortBy === "updatedAt") {
        return (left.updatedAt.getTime() - right.updatedAt.getTime()) * direction
      }
      const leftDue = left.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightDue = right.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
      return (leftDue - rightDue) * direction
    })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const pageCommitments = filtered.slice(pageStart, pageStart + pageSize)

  let detectedCount = 0
  let detectedCandidates: Awaited<ReturnType<typeof listDetectedCommitmentCandidates>> = []
  if (hasPlanFeature(tier, "commitguard_detection")) {
    try {
      detectedCandidates = await listDetectedCommitmentCandidates(user.id)
      detectedCount = detectedCandidates.filter((candidate) => candidate.status === "pending").length
    } catch {
      detectedCount = 0
    }
  }

  const monthWindow = summary.horizons.find((horizon) => horizon.days === 30)

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">CommitGuard</h1>
            <p className="mt-1 text-sm text-gray-600">
              Protect upcoming cash with commitment forecasting, renewal visibility, and confidence-scored detection.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/settings/commitguard"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Settings
            </Link>
            <Link
              href="/dashboard/settings/import-export"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Import / export
            </Link>
          </div>
        </div>
        {costGuardAlertId ? (
          <p className="mt-3 text-xs text-gray-600">
            Filtered to commitments linked to Cost Guard alert {costGuardAlertId}.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Committed (next 30 days)</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(monthWindow?.totalCents ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Protected cash</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(summary.freeCash.protectedCashCents)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Free cash</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{formatAudCents(summary.freeCash.freeCashCents)}</p>
          <p className="mt-1 text-xs text-gray-600">Status: {summary.freeCash.status.replace("_", " ")}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Detected commitments</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{detectedCount}</p>
          <p className="mt-1 text-xs text-gray-600">Pending review queue</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.horizons.map((horizon) => (
          <div key={horizon.days} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">{horizon.days}-day horizon</p>
            <p className="mt-2 text-xl font-semibold text-gray-900">{formatAudCents(horizon.totalCents)}</p>
            <p className="mt-1 text-xs text-gray-600">
              Confirmed {formatAudCents(horizon.confirmedCents)} · Probable {formatAudCents(horizon.probableCents)}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">Upcoming commitments</h2>
          <p className="text-xs text-gray-500">
            Page {currentPage} of {totalPages}
          </p>
        </div>

        {pageCommitments.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="text-sm font-medium text-gray-800">No commitments in this view yet</p>
            <p className="mt-1 text-sm text-gray-600">
              Add commitments manually or enable recurring detection from settings.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Frequency</th>
                  <th className="px-2 py-2">Confidence</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageCommitments.map((commitment) => (
                  <tr key={commitment.id} className="border-b border-gray-100">
                    <td className="px-2 py-2 font-medium text-gray-900">{commitment.name}</td>
                    <td className="px-2 py-2 text-gray-700">{commitment.category}</td>
                    <td className="px-2 py-2 text-gray-700">
                      {commitment.nextDueDate ? commitment.nextDueDate.toLocaleDateString("en-AU") : "Unscheduled"}
                    </td>
                    <td className="px-2 py-2 text-gray-700">{formatAudCents(commitment.amountCents)}</td>
                    <td className="px-2 py-2 text-gray-700">{commitment.frequency.replaceAll("_", " ")}</td>
                    <td className="px-2 py-2 text-gray-700">{commitment.confidence}</td>
                    <td className="px-2 py-2 text-gray-700">{commitment.status.replaceAll("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CommitGuardWorkspace
        initialCommitments={commitments.map((commitment) => ({
          id: commitment.id,
          name: commitment.name,
          category: commitment.category,
          amountCents: commitment.amountCents,
          frequency: commitment.frequency,
          nextDueDate: commitment.nextDueDate ? commitment.nextDueDate.toISOString() : null,
          confidence: commitment.confidence,
          status: commitment.status,
        }))}
        initialDetectedCandidates={detectedCandidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          category: candidate.category,
          frequency: candidate.frequency,
          typicalAmountCents: candidate.typicalAmountCents,
          confidence: candidate.confidence,
          source: candidate.source,
          status: candidate.status,
        }))}
        detectionEnabled={hasPlanFeature(tier, "commitguard_detection")}
      />

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">Renewals and notice windows</h2>
        {summary.renewals.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No renewal dates are currently set on tracked commitments.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {summary.renewals.slice(0, 8).map((renewal) => (
              <div key={renewal.commitmentId} className="rounded-md border border-gray-200 px-3 py-2">
                <p className="text-sm font-medium text-gray-900">{renewal.name}</p>
                <p className="text-xs text-gray-600">
                  Renewal: {renewal.renewalDate.toLocaleDateString("en-AU")} · Notice closes: {renewal.noticeCloseDate.toLocaleDateString("en-AU")}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-700">
                  {severityLabel(renewal.severity)} ({renewal.daysToNoticeClose} days to notice close)
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
