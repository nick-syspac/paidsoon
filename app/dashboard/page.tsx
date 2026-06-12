import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { getPlanByTier, hasPlanFeature } from "@/lib/subscriptionPlans"
import { buildDashboardUpsellModel } from "@/lib/dashboardUpsell"
import { InvoiceTable } from "@/components/dashboard/InvoiceTable"
import { LockedDashboardPreview } from "@/components/dashboard/LockedDashboardPreview"
import { UpgradeBanner } from "@/components/dashboard/UpgradeBanner"
import Link from "next/link"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ resolved?: string; intent?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const params = await searchParams
  const showResolved = params.resolved === "1"
  const featureIntent = params.intent ?? null

  const activeStatuses = ["pending", "paused", "snoozed", "sequence_complete"]
  const resolvedStatuses = ["paid", "manually_resolved"]

  const { profile, connection, activeTrackedCount } = await withUserContext(
    user.id,
    async (tx) => {
      const [profile, connection, activeTrackedCount] = await Promise.all([
        tx.userProfile.findUnique({ where: { userId: user.id } }),
        tx.invoiceConnection.findFirst({
          where: { userId: user.id, isActive: true },
        }),
        tx.trackedInvoice.count({
          where: {
            userId: user.id,
            status: { in: activeStatuses },
          },
        }),
      ])
      return { profile, connection, activeTrackedCount }
    },
  )

  const plan = getPlanByTier(profile?.subscriptionTier)
  const canViewPaymentStatus = hasPlanFeature(plan.id, "payment_status_dashboard")
  const canViewOverdue = hasPlanFeature(plan.id, "overdue_invoice_dashboard")
  const atLimit =
    !showResolved &&
    activeTrackedCount >= plan.limits.chasedInvoicesPerMonth

  if (showResolved && !canViewPaymentStatus) {
    redirect("/dashboard")
  }

  const canShowDashboardModule = showResolved ? canViewPaymentStatus : canViewOverdue

  const invoices = canShowDashboardModule
    ? await withUserContext(user.id, (tx) =>
        tx.trackedInvoice.findMany({
          where: {
            userId: user.id,
            status: { in: showResolved ? resolvedStatuses : activeStatuses },
          },
          orderBy: showResolved ? { updatedAt: "desc" } : { nextEmailAt: "asc" },
          include: { emailLogs: { orderBy: { sentAt: "asc" } } },
        }),
      )
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          {showResolved ? "Resolved Invoices" : "Overdue Invoices"}
        </h1>
        <div className="flex items-center gap-3">
          {showResolved ? (
            <Link
              href="/dashboard"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              ← Active invoices
            </Link>
          ) : canViewPaymentStatus ? (
            <Link
              href="/dashboard?resolved=1"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              View resolved
            </Link>
          ) : null}
          {!connection && !showResolved && canShowDashboardModule && (
            <a
              href="/dashboard/settings/stripe"
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
            >
              Connect Stripe →
            </a>
          )}
        </div>
      </div>

      {atLimit && canShowDashboardModule && (
        <UpgradeBanner
          trackedCount={activeTrackedCount}
          tierName={plan.name}
          tierLimit={plan.limits.chasedInvoicesPerMonth}
        />
      )}

      {!canShowDashboardModule && (
        <LockedDashboardPreview
          model={buildDashboardUpsellModel({
            tier: plan.id,
            usageCount: activeTrackedCount,
            usageLimit: plan.limits.chasedInvoicesPerMonth,
            featureIntent,
            showResolved,
          })}
        />
      )}

      {canShowDashboardModule && invoices.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">
            {showResolved ? "No resolved invoices yet." : "No overdue invoices tracked."}
          </p>
          <p className="text-sm mt-1">
            {showResolved
              ? "Paid and manually resolved invoices will appear here."
              : connection
              ? "Sit back — we'll alert you when something goes overdue."
              : "Connect your Stripe account to get started."}
          </p>
        </div>
      ) : canShowDashboardModule ? (
        <InvoiceTable invoices={invoices} showResolved={showResolved} />
      ) : null}
    </div>
  )
}

