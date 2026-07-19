import { createClient } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getPlanByTier, hasPlanFeature } from "@/lib/subscriptionPlans"
import { buildDashboardUpsellModel } from "@/lib/dashboardUpsell"
import { InvoiceTable } from "@/components/dashboard/InvoiceTable"
import { LockedDashboardPreview } from "@/components/dashboard/LockedDashboardPreview"
import { UpgradeBanner } from "@/components/dashboard/UpgradeBanner"
import Link from "next/link"
import { buildBrokenPromiseCountsByDebtor } from "@/lib/promiseEscalationPolicy"
import {
  createServerTraceContext,
  traceEvent,
  traceOperation,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace } from "@/lib/diagnostics/shared"
import { buildDashboardRenderTraceSummary } from "@/lib/diagnostics/dashboard"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ resolved?: string; intent?: string }>
}) {
  const requestHeaders = await headers()
  const traceContext = createServerTraceContext({
    headers: requestHeaders,
    cookieHeader: requestHeaders.get("cookie"),
  })
  warnIfProductionDebugEnabled(traceContext)

  const supabase = await createClient()
  const { data: { user } } = await traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.page.auth",
      operation: "supabase.auth.getUser",
      subsystem: "dashboard",
      component: "app/dashboard/page.tsx",
    },
    () => supabase.auth.getUser(),
    {
      success: (result) => ({
        auth: summariseAuthForTrace({ user: result.data.user }),
        outputs: { userPresent: Boolean(result.data.user) },
      }),
    },
  )
  if (!user) {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.page.redirect",
        operation: "redirect_unauthenticated_page",
        subsystem: "dashboard",
        component: "app/dashboard/page.tsx",
        event: "decision",
        navigation: { from: "/dashboard", to: "/sign-in", decision: "page_unauthenticated" },
        auth: summariseAuthForTrace({ user }),
      }),
      traceContext,
    )
    redirect("/sign-in")
  }

  const params = await searchParams
  const showResolved = params.resolved === "1"
  const featureIntent = params.intent ?? null
  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.search_params",
      operation: "interpret_search_params",
      subsystem: "dashboard",
      component: "app/dashboard/page.tsx",
      event: "decision",
      inputs: { resolved: params.resolved ?? null, intentPresent: featureIntent !== null },
      outputs: { showResolved, featureIntentPresent: featureIntent !== null },
    }),
    traceContext,
  )

  const activeStatuses = ["pending", "paused", "snoozed", "sequence_complete"]
  const resolvedStatuses = ["paid", "manually_resolved"]

  const { profile, connection, activeTrackedCount } = await traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "dashboard.page.initial_data",
      operation: "withUserContext.dashboardInitialData",
      subsystem: "dashboard",
      component: "app/dashboard/page.tsx",
      auth: summariseAuthForTrace({ user }),
      tenant: { context: "user_rls" },
    },
    () =>
      withUserContext(
        user.id,
        async (tx) => {
          // Sequential, not Promise.all: queries on a single interactive
          // transaction's `tx` share one underlying pg connection — firing them
          // concurrently triggers a pg client deprecation warning and is unsafe.
          const profile = await tx.userProfile.findUnique({ where: { userId: user.id } })
          const connection = await tx.invoiceConnection.findFirst({
            where: { userId: user.id, isActive: true },
          })
          const activeTrackedCount = await tx.trackedInvoice.count({
            where: {
              userId: user.id,
              status: { in: activeStatuses },
            },
          })
          return { profile, connection, activeTrackedCount }
        },
      ),
    {
      success: (result) => ({
        outputs: {
          profilePresent: Boolean(result.profile),
          connectionPresent: Boolean(result.connection),
          activeTrackedCount: result.activeTrackedCount,
        },
      }),
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
  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.feature_gates",
      operation: "evaluate_dashboard_access",
      subsystem: "dashboard",
      component: "app/dashboard/page.tsx",
      event: "decision",
      outputs: {
        tier: plan.id,
        canViewPaymentStatus,
        canViewOverdue,
        canShowDashboardModule,
        atLimit,
        showResolved,
      },
    }),
    traceContext,
  )

  const invoices = canShowDashboardModule
    ? await traceOperation(
        traceContext,
        {
          traceId: traceContext.traceId,
          stage: "dashboard.page.invoice_load",
          operation: "withUserContext.trackedInvoice.findMany",
          subsystem: "dashboard",
          component: "app/dashboard/page.tsx",
          tenant: { context: "user_rls" },
          inputs: { showResolved },
        },
        () =>
          withUserContext(user.id, (tx) =>
            tx.trackedInvoice.findMany({
              where: {
                userId: user.id,
                status: { in: showResolved ? resolvedStatuses : activeStatuses },
              },
              orderBy: showResolved ? { updatedAt: "desc" } : { nextEmailAt: "asc" },
              include: {
                emailLogs: { orderBy: { sentAt: "asc" } },
                promisesToPay: {
                  orderBy: { createdAt: "desc" },
                },
                arrangementCoverages: {
                  orderBy: { createdAt: "desc" },
                  include: {
                    arrangement: {
                      include: {
                        coverages: { select: { trackedInvoiceId: true } },
                      },
                    },
                  },
                },
              },
            }),
          ),
        { success: (result) => ({ outputs: { invoiceCount: result.length } }) },
      )
    : []

  const promisePolicy = canShowDashboardModule
    ? await traceOperation(
        traceContext,
        {
          traceId: traceContext.traceId,
          stage: "dashboard.page.promise_policy_load",
          operation: "withUserContext.promiseEscalationPolicy.findUnique",
          subsystem: "dashboard",
          component: "app/dashboard/page.tsx",
          tenant: { context: "user_rls" },
        },
        () =>
          withUserContext(user.id, (tx) =>
            tx.promiseEscalationPolicy.findUnique({
              where: { userId: user.id },
              select: { escalationThreshold: true },
            }),
          ),
        { success: (result) => ({ outputs: { policyPresent: Boolean(result), escalationThreshold: result?.escalationThreshold ?? null } }) },
      )
    : null

  const brokenByDebtor = canShowDashboardModule
    ? await traceOperation(
        traceContext,
        {
          traceId: traceContext.traceId,
          stage: "dashboard.page.broken_promise_load",
          operation: "withUserContext.promiseToPay.findMany",
          subsystem: "dashboard",
          component: "app/dashboard/page.tsx",
          tenant: { context: "user_rls" },
        },
        () =>
          withUserContext(user.id, async (tx) => {
            const rows = await tx.promiseToPay.findMany({
              where: { userId: user.id, status: "broken" },
              select: {
                trackedInvoice: { select: { clientEmail: true } },
              },
            })

            return buildBrokenPromiseCountsByDebtor(
              rows.map((row) => ({ clientEmail: row.trackedInvoice.clientEmail }))
            )
          }),
        { success: (result) => ({ outputs: { debtorCount: Object.keys(result).length } }) },
      )
    : {}

  const renderSummary = buildDashboardRenderTraceSummary({
    canShowDashboardModule,
    invoiceCount: invoices.length,
    showResolved,
    hasConnection: Boolean(connection),
    atLimit,
  })
  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.render",
      operation: "render_dashboard_page",
      subsystem: "dashboard",
      component: "app/dashboard/page.tsx",
      event: "complete",
      outputs: renderSummary,
    }),
    traceContext,
  )

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
              href="/dashboard/settings/connections"
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
        <InvoiceTable
          invoices={invoices}
          showResolved={showResolved}
          brokenPromiseCountsByDebtor={brokenByDebtor}
          escalationThreshold={promisePolicy?.escalationThreshold ?? 2}
        />
      ) : null}
    </div>
  )
}

