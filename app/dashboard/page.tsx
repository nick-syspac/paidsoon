import { getAuthenticatedUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import {
  computeHeldInvoiceIds,
} from "@/lib/dashboard/loadDashboardRiskSignals"
import { buildOverviewCards } from "@/lib/dashboard/overviewCards"
import { OverviewCards } from "@/components/dashboard/OverviewCards"
import { loadDashboardOverview } from "@/lib/dashboard/loadDashboardOverview"
import { buildNeedsAttentionSummary } from "@/lib/dashboard/attentionRequired"
import { buildReminderFunnel } from "@/lib/dashboard/reminderActivity"
import { buildRecentPayments } from "@/lib/dashboard/collectionMetrics"
import { buildPaymentTrend } from "@/lib/dashboard/paymentTrend"
import { RecentPayments } from "@/components/dashboard/RecentPayments"
import { AttentionRequired } from "@/components/dashboard/AttentionRequired"
import { ReminderActivityFunnel } from "@/components/dashboard/ReminderActivityFunnel"
import { PaymentTrendChart } from "@/components/dashboard/PaymentTrendChart"
import { CurrencySummarySection } from "@/components/dashboard/CurrencySummarySection"
import { buildCurrencyDashboardSummaries } from "@/lib/dashboard/currencySummary"
import {
  createServerTraceContext,
  traceEvent,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace } from "@/lib/diagnostics/shared"

const COMPONENT = "app/dashboard/page.tsx"

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ resolved?: string }>
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
        navigation: { from: "/dashboard", to: "/sign-in", decision: "page_unauthenticated" },
        auth: summariseAuthForTrace({ user: null }),
      }),
      traceContext,
    )
    redirect("/sign-in")
  }

  // Legacy link support: `/dashboard?resolved=1` used to render the resolved
  // invoice view on this same route — it now lives at its own route
  // (openspec/changes/add-dashboard-overview).
  const params = await searchParams
  if (params.resolved === "1") {
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "dashboard.page.redirect",
        operation: "redirect_legacy_resolved_param",
        subsystem: "dashboard",
        component: COMPONENT,
        event: "decision",
        navigation: { from: "/dashboard?resolved=1", to: "/dashboard/resolved", decision: "legacy_query_param" },
      }),
      traceContext,
    )
    redirect("/dashboard/resolved")
  }

  const {
    context: { profile, chaseAllowance },
    activeInvoices,
    brokenPromiseCountsByDebtor,
    escalationThreshold,
    metrics: {
      paidInvoices,
      paidCountAllTime,
      manuallyResolvedCountAllTime,
      remindersSentToday,
    },
    disputedInvoiceCount,
    noContactEmailCustomerCount,
    importAnomalyCount,
  } = await loadDashboardOverview(user.id, traceContext, COMPONENT)

  const heldInvoiceIds = computeHeldInvoiceIds(activeInvoices, chaseAllowance?.atCapacity ?? false)

  const cards = buildOverviewCards({
    activeInvoices,
    chaseAllowance,
    brokenPromiseCountsByDebtor,
    escalationThreshold,
    heldInvoiceCount: heldInvoiceIds.size,
    disputedInvoiceCount,
  })

  const now = new Date()
  const currencySummaries = buildCurrencyDashboardSummaries({
    activeInvoices,
    paidInvoices,
    displayName: profile?.displayName ?? null,
    brokenPromiseCountsByDebtor,
    paidCountAllTime,
    manuallyResolvedCountAllTime,
    now,
  })
  const needsAttention = buildNeedsAttentionSummary({
    activeInvoices,
    brokenPromiseCountsByDebtor,
    escalationThreshold,
    disputedInvoiceCount,
    noContactEmailCustomerCount,
    importAnomalyCount,
    now,
  })
  const reminderFunnel = buildReminderFunnel({ activeInvoices, paidInvoices, remindersSentToday, now })
  const recentPayments = buildRecentPayments(paidInvoices)
  const paymentTrend = buildPaymentTrend({ activeInvoices, paidInvoices, now })
  const showCurrencyHeadings = currencySummaries.length > 1

  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "dashboard.page.render",
      operation: "render_dashboard_overview",
      subsystem: "dashboard",
      component: COMPONENT,
      event: "complete",
      outputs: { cardSeverities: Object.fromEntries(cards.map((card) => [card.id, card.severity])) },
    }),
    traceContext,
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Overview</h1>

      {currencySummaries.map((summary) => (
        <CurrencySummarySection
          key={summary.currency}
          summary={summary}
          showCurrencyHeading={showCurrencyHeadings}
        />
      ))}

      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3">Account health</h2>
        <OverviewCards cards={cards} />
      </div>

      <AttentionRequired summary={needsAttention} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentPayments payments={recentPayments} />
        <ReminderActivityFunnel steps={reminderFunnel} />
      </div>

      <PaymentTrendChart points={paymentTrend} />
    </div>
  )
}

