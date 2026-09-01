import Link from "next/link"
import { redirect } from "next/navigation"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { FindingActionButtons } from "@/components/dashboard/spendleak/FindingActionButtons"

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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/dashboard/spendleak" className="text-sm text-blue-700 hover:text-blue-800 hover:underline">
          ← Back to SpendLeak
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">{finding.findingType}</h1>
        <p className="text-sm text-gray-600">{finding.summary}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Evidence</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-700">
          {JSON.stringify(finding.evidence, null, 2)}
        </pre>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Lifecycle</h2>
        <div className="mt-3">
          <FindingActionButtons findingId={finding.id} initialState={state} />
        </div>
      </div>
    </div>
  )
}
