import { getAuthenticatedUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getPlanByTier, hasPlanFeature } from "@/lib/subscriptionPlans"
import { buildDashboardUpsellModel } from "@/lib/dashboardUpsell"
import { InvoiceTable } from "@/components/dashboard/InvoiceTable"
import { LockedDashboardPreview } from "@/components/dashboard/LockedDashboardPreview"
import { UpgradeBanner } from "@/components/dashboard/UpgradeBanner"
import { loadDashboardContext } from "@/lib/dashboard/loadDashboardContext"
import {
  ACTIVE_INVOICE_STATUSES,
  loadDashboardInvoices,
} from "@/lib/dashboard/loadDashboardInvoices"
import {
  computeHeldInvoiceIds,
  loadBrokenPromiseCountsByDebtor,
  loadEscalationThreshold,
} from "@/lib/dashboard/loadDashboardRiskSignals"
import { filterInvoicesByOverviewCard, parseInvoiceOverviewFilter } from "@/lib/dashboard/overviewCards"
import {
  createServerTraceContext,
  traceEvent,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace } from "@/lib/diagnostics/shared"
import { buildDashboardRenderTraceSummary } from "@/lib/diagnostics/dashboard"

const COMPONENT = "app/dashboard/invoices/page.tsx"

export default async function DashboardInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; filter?: string }>
}) {
  const requestHeaders = await headers()
  const traceContext = createServerTraceContext({
    headers: requestHeaders,
    cookieHeader: requestHeaders.get("cookie"),
  })
  warnIfProductionDebugEnabled(traceContext)

  const { data: { user } } = await getAuthenticatedUser()
  if (!user) {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.page.redirect",
        operation: "redirect_unauthenticated_page",
        subsystem: "dashboard",
        component: COMPONENT,
        event: "decision",
        navigation: { from: "/dashboard/invoices", to: "/sign-in", decision: "page_unauthenticated" },
        auth: summariseAuthForTrace({ user: null }),
      }),
      traceContext,
    )
    redirect("/sign-in")
  }

  const params = await searchParams
  const featureIntent = params.intent ?? null
  const filter = parseInvoiceOverviewFilter(params.filter)

  const { profile, connection, chaseAllowance } = await loadDashboardContext(
    user.id,
    traceContext,
    COMPONENT,
  )

  // Defensive only: every tier currently has `overdue_invoice_dashboard: true`
  // in lib/subscriptionPlans.ts, so this never actually locks a real tier
  // today — kept in case a future tier disables the feature.
  const plan = getPlanByTier(profile?.subscriptionTier)
  const canViewOverdue = hasPlanFeature(plan.id, "overdue_invoice_dashboard")
  const atLimit = chaseAllowance?.atCapacity ?? false
  const nearLimit = chaseAllowance?.nearLimit ?? false

  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.feature_gates",
      operation: "evaluate_dashboard_access",
      subsystem: "dashboard",
      component: COMPONENT,
      event: "decision",
      outputs: { tier: plan.id, canViewOverdue, atLimit, nearLimit },
    }),
    traceContext,
  )

  let invoices: Awaited<ReturnType<typeof loadDashboardInvoices>> = []
  let brokenPromiseCountsByDebtor: Record<string, number> = {}
  let escalationThreshold = 2

  if (canViewOverdue) {
    // Keep dashboard loaders sequential to avoid overlapping db-adapter query
    // execution on shared request scope clients.
    invoices = await loadDashboardInvoices(
      user.id,
      ACTIVE_INVOICE_STATUSES,
      { nextEmailAt: "asc" },
      traceContext,
      COMPONENT,
    )
    brokenPromiseCountsByDebtor = await loadBrokenPromiseCountsByDebtor(
      user.id,
      traceContext,
      COMPONENT,
    )
    escalationThreshold = await loadEscalationThreshold(user.id, traceContext, COMPONENT)
  }

  const heldInvoiceIds = computeHeldInvoiceIds(invoices, atLimit)

  const visibleInvoices = filterInvoicesByOverviewCard(invoices, filter, {
    brokenPromiseCountsByDebtor,
    escalationThreshold,
    heldInvoiceIds,
  })

  const renderSummary = buildDashboardRenderTraceSummary({
    canShowDashboardModule: canViewOverdue,
    invoiceCount: visibleInvoices.length,
    showResolved: false,
    hasConnection: Boolean(connection),
    atLimit,
  })
  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.render",
      operation: "render_dashboard_invoices",
      subsystem: "dashboard",
      component: COMPONENT,
      event: "complete",
      outputs: renderSummary,
    }),
    traceContext,
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
        <div className="flex items-center gap-2">
          {canViewOverdue && (
            <a
              href="/dashboard/settings/import"
              className="text-sm bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50"
            >
              Import invoices
            </a>
          )}
          {!connection && canViewOverdue && (
            <a
              href="/dashboard/settings/connections"
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700"
            >
              Connect Stripe →
            </a>
          )}
        </div>
      </div>

      {canViewOverdue && chaseAllowance && (
        <p className="text-xs text-gray-500">
          {chaseAllowance.usage} of {chaseAllowance.allowance} chases used this period · resets{" "}
          {chaseAllowance.period.end.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
        </p>
      )}

      {(atLimit || nearLimit) && canViewOverdue && chaseAllowance && (
        <UpgradeBanner
          usage={chaseAllowance.usage}
          allowance={chaseAllowance.allowance}
          periodEnd={chaseAllowance.period.end}
          tierName={plan.name}
          atCapacity={chaseAllowance.atCapacity}
        />
      )}

      {!canViewOverdue && (
        <LockedDashboardPreview
          model={buildDashboardUpsellModel({
            tier: plan.id,
            usageCount: chaseAllowance?.usage ?? 0,
            usageLimit: plan.limits.chasedInvoicesPerMonth,
            periodEnd: chaseAllowance?.period.end ?? null,
            featureIntent,
            showResolved: false,
          })}
        />
      )}

      {canViewOverdue && visibleInvoices.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">
            {filter ? "No invoices match this filter." : "No overdue invoices tracked."}
          </p>
          <p className="text-sm mt-1">
            {filter
              ? "Nothing here right now — check back once something changes."
              : connection
              ? "Sit back — we'll alert you when something goes overdue."
              : "Connect your Stripe account to get started."}
          </p>
        </div>
      ) : canViewOverdue ? (
        <InvoiceTable
          invoices={visibleInvoices}
          showResolved={false}
          brokenPromiseCountsByDebtor={brokenPromiseCountsByDebtor}
          escalationThreshold={escalationThreshold}
          heldInvoiceIds={heldInvoiceIds}
          heldAllowance={
            chaseAllowance
              ? {
                  usage: chaseAllowance.usage,
                  allowance: chaseAllowance.allowance,
                  resetsAt: chaseAllowance.period.end,
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
