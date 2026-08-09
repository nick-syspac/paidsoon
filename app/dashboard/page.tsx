import { getAuthenticatedUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
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
import { buildOverviewCards } from "@/lib/dashboard/overviewCards"
import { OverviewCards } from "@/components/dashboard/OverviewCards"
import { loadDashboardMetrics } from "@/lib/dashboard/loadDashboardMetrics"
import { buildAgeingBuckets, buildCashWaitingSummary } from "@/lib/dashboard/ageing"
import { buildTopKpiCards } from "@/lib/dashboard/topKpiCards"
import { buildBiggestDebtors } from "@/lib/dashboard/biggestDebtors"
import { buildAttentionItems } from "@/lib/dashboard/attentionRequired"
import { buildReminderFunnel } from "@/lib/dashboard/reminderActivity"
import { buildCollectionPerformance, buildRecentPayments } from "@/lib/dashboard/collectionMetrics"
import { buildPaymentTrend } from "@/lib/dashboard/paymentTrend"
import { buildAiSummary } from "@/lib/dashboard/aiSummary"
import { TopKpiCards } from "@/components/dashboard/TopKpiCards"
import { CashWaitingSummary } from "@/components/dashboard/CashWaitingSummary"
import { AgeingChart } from "@/components/dashboard/AgeingChart"
import { RecentPayments } from "@/components/dashboard/RecentPayments"
import { AttentionRequired } from "@/components/dashboard/AttentionRequired"
import { ReminderActivityFunnel } from "@/components/dashboard/ReminderActivityFunnel"
import { CollectionPerformance } from "@/components/dashboard/CollectionPerformance"
import { BiggestDebtors } from "@/components/dashboard/BiggestDebtors"
import { PaymentTrendChart } from "@/components/dashboard/PaymentTrendChart"
import { AiSummaryCard } from "@/components/dashboard/AiSummaryCard"
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

  // Keep dashboard loaders sequential to avoid overlapping db-adapter query
  // execution on shared request scope clients.
  const { profile, chaseAllowance } = await loadDashboardContext(user.id, traceContext, COMPONENT)
  const activeInvoices = await loadDashboardInvoices(
    user.id,
    ACTIVE_INVOICE_STATUSES,
    { nextEmailAt: "asc" },
    traceContext,
    COMPONENT,
  )
  const brokenPromiseCountsByDebtor = await loadBrokenPromiseCountsByDebtor(
    user.id,
    traceContext,
    COMPONENT,
  )
  const escalationThreshold = await loadEscalationThreshold(user.id, traceContext, COMPONENT)
  const {
    paidInvoices,
    paidCountAllTime,
    manuallyResolvedCountAllTime,
    remindersSentToday,
  } = await loadDashboardMetrics(user.id, traceContext, COMPONENT)

  const heldInvoiceIds = computeHeldInvoiceIds(activeInvoices, chaseAllowance?.atCapacity ?? false)

  const cards = buildOverviewCards({
    activeInvoices,
    chaseAllowance,
    brokenPromiseCountsByDebtor,
    escalationThreshold,
    heldInvoiceCount: heldInvoiceIds.size,
  })

  const now = new Date()
  const currency = activeInvoices[0]?.currency ?? paidInvoices[0]?.currency ?? "usd"

  const topKpiCards = buildTopKpiCards({
    activeInvoices,
    paidInvoices,
    paidCountAllTime,
    manuallyResolvedCountAllTime,
    now,
  })
  const ageingBuckets = buildAgeingBuckets(activeInvoices, now)
  const cashWaitingSummary = buildCashWaitingSummary(ageingBuckets)
  const biggestDebtors = buildBiggestDebtors(activeInvoices, now)
  const attentionItems = buildAttentionItems({ activeInvoices, paidInvoices, now })
  const reminderFunnel = buildReminderFunnel({ activeInvoices, paidInvoices, remindersSentToday, now })
  const recentPayments = buildRecentPayments(paidInvoices)
  const collectionPerformance = buildCollectionPerformance({
    paidInvoices,
    paidCountAllTime,
    manuallyResolvedCountAllTime,
    now,
  })
  const paymentTrend = buildPaymentTrend({ activeInvoices, paidInvoices, now })
  const aiSummaryLines = buildAiSummary({
    displayName: profile?.displayName ?? null,
    activeInvoices,
    paidInvoices,
    brokenPromiseCountsByDebtor,
    now,
  })

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

      <AiSummaryCard lines={aiSummaryLines} />

      <TopKpiCards cards={topKpiCards} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CashWaitingSummary summary={cashWaitingSummary} currency={currency} />
        <AgeingChart buckets={ageingBuckets} currency={currency} />
      </div>

      <AttentionRequired items={attentionItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentPayments payments={recentPayments} />
        <ReminderActivityFunnel steps={reminderFunnel} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CollectionPerformance performance={collectionPerformance} currency={currency} />
        <BiggestDebtors debtors={biggestDebtors} />
      </div>

      <PaymentTrendChart points={paymentTrend} />

      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3">Account health</h2>
        <OverviewCards cards={cards} />
      </div>
    </div>
  )
}

