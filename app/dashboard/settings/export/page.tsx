import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { hasPlanFeature, normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { InvoiceExportClient } from "@/components/settings/InvoiceExportClient"

export default async function InvoiceExportSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const profile = await withUserContext(user.id, (tx) =>
    tx.userProfile.findUnique({
      where: { userId: user.id },
      select: { subscriptionTier: true },
    }),
  )

  const tier = normalizeSubscriptionTier(profile?.subscriptionTier)
  const canExport = hasPlanFeature(tier, "csv_export")

  if (!canExport) {
    return (
      <div className="max-w-lg space-y-4">
        <h2 className="text-base font-medium text-gray-900">Invoice exports</h2>
        <p className="text-sm text-gray-500">
          Export your invoices to CSV or XLSX with custom filters — available on the Small Business plan and above.
        </p>
        <a
          href="/dashboard/settings/subscription"
          className="inline-block bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Upgrade now
        </a>
      </div>
    )
  }

  const customers = await withUserContext(user.id, (tx) =>
    tx.customer.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        financialContact: { select: { name: true, email: true } },
      },
    }),
  )

  return (
    <InvoiceExportClient
      customers={customers
        .map((customer) => ({
          id: customer.id,
          label: customer.financialContact.name || customer.financialContact.email || "Unknown",
        }))
        .sort((a, b) => a.label.localeCompare(b.label))}
    />
  )
}
