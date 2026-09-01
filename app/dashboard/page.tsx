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
import Link from "next/link"
import { loadSpendLeakDashboard } from "@/lib/dashboard/loadSpendLeakDashboard"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import { buildFinancialOperationsSummary } from "@/lib/dashboard/financialOperationsSummary"
import { buildSpendLeakOverviewHref } from "@/lib/dashboard/spendleakNavigation"
import type { SpendLeakModuleId } from "@/lib/dashboard/spendleakPresentation"
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

  const canViewSpendLeak = canAccessSpendLeak(profile?.subscriptionTier)
  const spendLeakData = canViewSpendLeak ? await loadSpendLeakDashboard(user.id) : null
  const topSpendLeakModule = spendLeakData?.modules
    .filter((module) => module.findingCount > 0)
    .sort((left, right) => right.estimatedAnnualCents - left.estimatedAnnualCents)[0]
  const financialSummary = buildFinancialOperationsSummary({
    activeInvoiceCount: activeInvoices.length,
    spendFindingCount: spendLeakData?.findings.length ?? 0,
    hasSpendLeakAccess: canViewSpendLeak,
    hasAccountingConnection: spendLeakData?.hasAccountingConnection ?? false,
    latestSyncAt: spendLeakData?.latestSyncAt ?? null,
  })

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

      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3">Account health</h2>
        <OverviewCards cards={cards} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Financial operations summary</h2>
            <p className="mt-1 text-sm text-gray-600">
              Receivables momentum from PaidSoon plus spend-side signals from SpendLeak.
            </p>
          </div>
          <Link
            href={buildSpendLeakOverviewHref(financialSummary.showUnlockCta, topSpendLeakModule?.id ?? null)}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {financialSummary.showUnlockCta ? "Unlock SpendLeak" : "Open SpendLeak"}
          </Link>
        </div>
        {canViewSpendLeak && spendLeakData ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Cash in (active invoices)</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{financialSummary.activeInvoiceCount}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Cash out findings</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{financialSummary.spendFindingCount}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Spend sync status</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{financialSummary.spendStatusLabel}</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            Spend-side insights are not yet available on your current tier.
          </p>
        )}
      </section>

      {currencySummaries.map((summary) => (
        <CurrencySummarySection
          key={summary.currency}
          summary={summary}
          showCurrencyHeading={showCurrencyHeadings}
        />
      ))}

      <AttentionRequired summary={needsAttention} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentPayments payments={recentPayments} />
        <ReminderActivityFunnel steps={reminderFunnel} />
      </div>

      <PaymentTrendChart points={paymentTrend} />
    </div>
  )
}

