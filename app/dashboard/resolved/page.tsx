import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getPlanByTier, hasPlanFeature } from "@/lib/subscriptionPlans"
import { buildDashboardUpsellModel } from "@/lib/dashboardUpsell"
import { InvoiceTable } from "@/components/dashboard/InvoiceTable"
import { LockedDashboardPreview } from "@/components/dashboard/LockedDashboardPreview"
import { loadDashboardContext } from "@/lib/dashboard/loadDashboardContext"
import {
  RESOLVED_INVOICE_STATUSES,
  loadDashboardInvoices,
} from "@/lib/dashboard/loadDashboardInvoices"
import {
  loadBrokenPromiseCountsByDebtor,
  loadEscalationThreshold,
} from "@/lib/dashboard/loadDashboardRiskSignals"
import {
  createServerTraceContext,
  traceEvent,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace } from "@/lib/diagnostics/shared"
import { buildDashboardRenderTraceSummary } from "@/lib/diagnostics/dashboard"

const COMPONENT = "app/dashboard/resolved/page.tsx"

export default async function DashboardResolvedPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>
}) {
  const requestHeaders = await headers()
  const traceContext = createServerTraceContext({
    headers: requestHeaders,
    cookieHeader: requestHeaders.get("cookie"),
  })
  warnIfProductionDebugEnabled(traceContext)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.page.redirect",
        operation: "redirect_unauthenticated_page",
        subsystem: "dashboard",
        component: COMPONENT,
        event: "decision",
        navigation: { from: "/dashboard/resolved", to: "/sign-in", decision: "page_unauthenticated" },
        auth: summariseAuthForTrace({ user: null }),
      }),
      traceContext,
    )
    redirect("/sign-in")
  }

  const params = await searchParams
  const featureIntent = params.intent ?? null

  const { profile, chaseAllowance } = await loadDashboardContext(user.id, traceContext, COMPONENT)

  // Defensive only: every tier currently has `payment_status_dashboard: true`
  // in lib/subscriptionPlans.ts, so this never actually locks a real tier
  // today — kept in case a future tier disables the feature.
  const plan = getPlanByTier(profile?.subscriptionTier)
  const canViewPaymentStatus = hasPlanFeature(plan.id, "payment_status_dashboard")

  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.feature_gates",
      operation: "evaluate_dashboard_access",
      subsystem: "dashboard",
      component: COMPONENT,
      event: "decision",
      outputs: { tier: plan.id, canViewPaymentStatus },
    }),
    traceContext,
  )

  const invoices = canViewPaymentStatus
    ? await loadDashboardInvoices(
        user.id,
        RESOLVED_INVOICE_STATUSES,
        { updatedAt: "desc" },
        traceContext,
        COMPONENT,
      )
    : []

  const brokenPromiseCountsByDebtor = canViewPaymentStatus
    ? await loadBrokenPromiseCountsByDebtor(user.id, traceContext, COMPONENT)
    : {}
  const escalationThreshold = canViewPaymentStatus
    ? await loadEscalationThreshold(user.id, traceContext, COMPONENT)
    : 2

  const renderSummary = buildDashboardRenderTraceSummary({
    canShowDashboardModule: canViewPaymentStatus,
    invoiceCount: invoices.length,
    showResolved: true,
    hasConnection: true,
    atLimit: false,
  })
  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.render",
      operation: "render_dashboard_resolved",
      subsystem: "dashboard",
      component: COMPONENT,
      event: "complete",
      outputs: renderSummary,
    }),
    traceContext,
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Resolved Invoices</h1>

      {!canViewPaymentStatus && (
        <LockedDashboardPreview
          model={buildDashboardUpsellModel({
            tier: plan.id,
            usageCount: chaseAllowance?.usage ?? 0,
            usageLimit: plan.limits.chasedInvoicesPerMonth,
            periodEnd: chaseAllowance?.period.end ?? null,
            featureIntent,
            showResolved: true,
          })}
        />
      )}

      {canViewPaymentStatus && invoices.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No resolved invoices yet.</p>
          <p className="text-sm mt-1">Paid and manually resolved invoices will appear here.</p>
        </div>
      ) : canViewPaymentStatus ? (
        <InvoiceTable
          invoices={invoices}
          showResolved={true}
          brokenPromiseCountsByDebtor={brokenPromiseCountsByDebtor}
          escalationThreshold={escalationThreshold}
        />
      ) : null}
    </div>
  )
}
