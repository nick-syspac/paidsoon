import Link from "next/link"
import { redirect } from "next/navigation"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { FindingActionButtons } from "@/components/dashboard/spendleak/FindingActionButtons"
import { SpendLeakEvidenceDetails } from "@/components/dashboard/spendleak/SpendLeakEvidenceDetails"

type Params = { params: Promise<{ id: string }> }

export default async function SpendLeakFindingPage({ params }: Params) {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const { id } = await params
  const finding = await withUserContext(user.id, (tx) =>
    tx.spendInsight.findFirst({
      where: { id, userId: user.id },
    }),
  )

  if (!finding) {
    return (
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-gray-900">Finding unavailable</h1>
        <p className="text-sm text-gray-600">This finding no longer exists or you do not have access to it.</p>
        <Link href="/dashboard/spendleak" className="text-sm text-blue-700 hover:text-blue-800 hover:underline">
          Back to SpendLeak
        </Link>
      </div>
    )
  }

  const state = (["open", "resolved", "dismissed", "snoozed"].includes(finding.state)
    ? finding.state
    : "open") as "open" | "resolved" | "dismissed" | "snoozed"
  const impactLabel =
    finding.estimatedAnnualCents !== null && finding.estimatedAnnualCents !== undefined
      ? new Intl.NumberFormat("en-AU", {
          style: "currency",
          currency: "AUD",
          maximumFractionDigits: 0,
        }).format(finding.estimatedAnnualCents / 100)
      : "Not available"

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/dashboard/spendleak" className="text-sm text-blue-700 hover:text-blue-800 hover:underline">
          ← Back to SpendLeak
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-gray-900">{finding.findingType}</h1>
            <p className="text-sm text-gray-600">{finding.summary}</p>
          </div>
          <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium text-gray-700">
            {state}
          </div>
          <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium text-gray-700">
            {impactLabel} / yr
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <SpendLeakEvidenceDetails finding={finding} />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Lifecycle</h2>
          <p className="mt-1 text-sm text-gray-600">Use lifecycle controls to manage this finding without losing the evidence trail.</p>
          <div className="mt-3">
            <FindingActionButtons findingId={finding.id} initialState={state} />
          </div>
        </div>
      </div>
    </div>
  )
}
