import Link from "next/link"
import { redirect } from "next/navigation"

import { getDashboardProfile } from "@/lib/dashboard/loadDashboardProfile"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { SpendClassificationReviewClient } from "@/components/dashboard/spendleak/SpendClassificationReviewClient"

export default async function SpendClassificationReviewPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const profile = await getDashboardProfile(user.id)
  if (!canAccessSpendLeak(profile?.subscriptionTier)) {
    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-semibold text-amber-900">Imported spend review</h1>
        <p className="text-sm text-amber-900">Imported spend classification is currently available on selected tiers.</p>
        <Link href="/dashboard/settings/subscription?intent=spendleak" className="inline-flex rounded-md bg-amber-700 px-3 py-1.5 text-sm text-white hover:bg-amber-800">
          View plans
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/spendleak" className="text-sm text-blue-700 hover:underline">← SpendLeak</Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Review imported spend</h1>
        <p className="mt-1 text-sm text-gray-600">Confirm or correct analytical categories. Changes stay in PaidSoon and never write back to your accounting provider.</p>
      </div>
      <SpendClassificationReviewClient />
    </div>
  )
}
