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
import { AiSummaryCard } from "@/components/dashboard/AiSummaryCard"
import { buildCurrencyDashboardSummaries } from "@/lib/dashboard/currencySummary"
import Link from "next/link"
import { loadSpendLeakDashboard } from "@/lib/dashboard/loadSpendLeakDashboard"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"
import { canAccessMarginGuard } from "@/lib/dashboard/marginguardAccess"
import { canAccessOwnersDigest } from "@/lib/dashboard/ownersDigestAccess"
import { buildFinancialOperationsSummary } from "@/lib/dashboard/financialOperationsSummary"
import { buildSpendLeakOverviewHref } from "@/lib/dashboard/spendleakNavigation"
import { formatAudCents, getSpendLeakEvidenceSource } from "@/lib/dashboard/spendleakPresentation"
import { buildCostGuardNotificationPlan } from "@/lib/costGuard/foundation"
import { getMarginSummary, getMarginTrends } from "@/lib/marginguard/service"
import { canAccessTaxBuffer } from "@/lib/dashboard/taxBufferAccess"
import { canAccessRunwayGuard } from "@/lib/dashboard/runwayGuardAccess"
import { loadTaxBufferSummary } from "@/lib/taxBuffer/service"
import { buildTaxBufferDigestSummary } from "@/lib/taxBuffer/engine"
import { summarizeCommitGuard } from "@/lib/commitguard/service"
import { getCurrentOwnersDigest } from "@/lib/ownersDigest/service"
import {
  buildCashPlanForecast,
  buildCashPlanSummaryResponse,
  defaultCashPlanSettings,
  type CashPlanForecastWeek,
} from "@/lib/cashplan/engine"
import { buildCashPlanDashboardStatus } from "@/lib/dashboard/cashPlanStatus"
import { hasPlanFeature } from "@/lib/subscriptionPlans"
import {
  createServerTraceContext,
  traceEvent,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace } from "@/lib/diagnostics/shared"
import { withUserContext } from "@/lib/db/withUserContext"

const COMPONENT = "app/dashboard/page.tsx"

function formatOptionalAudCents(value: number | null): string {
  return value === null ? "Not available" : formatAudCents(value)
}

function formatOwnersDigestStatus(status: "healthy" | "watch" | "action_required" | "critical"): string {
  switch (status) {
    case "healthy":
      return "Healthy"
    case "watch":
      return "Watch"
    case "action_required":
      return "Action Required"
    case "critical":
      return "Critical"
  }
}

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
  const canViewOwnersDigest = canAccessOwnersDigest(profile?.subscriptionTier)
  const canViewMarginGuard = canAccessMarginGuard(profile?.subscriptionTier)
  const canViewRunwayGuard = canAccessRunwayGuard(profile?.subscriptionTier)
  const canViewTaxBuffer = canAccessTaxBuffer(profile?.subscriptionTier)
  const canViewCommitGuard = hasPlanFeature(profile?.subscriptionTier, "commitguard_core")
  const runwayGuardStatus = canViewRunwayGuard
    ? await withUserContext(user.id, async (tx) => {
        const [settings, latestSnapshot] = await Promise.all([
          tx.runwayGuardSetting.findFirst({
            where: { userId: user.id },
            orderBy: { updatedAt: "desc" },
            select: {
              enabled: true,
              horizonDays: true,
              warningThresholdDays: true,
              criticalThresholdDays: true,
              minimumConfidence: true,
            },
          }),
          tx.runwayGuardSnapshot.findFirst({
            where: { userId: user.id },
            orderBy: { snapshotAt: "desc" },
            select: {
              runwayDays: true,
              usableCashCents: true,
              projectedExhaustionDay: true,
              status: true,
              confidence: true,
              snapshotAt: true,
            },
          }),
        ])

        if (!settings || !latestSnapshot) {
          return null
        }

        return {
          enabled: settings.enabled,
          horizonDays: settings.horizonDays,
          runwayDays: latestSnapshot.runwayDays,
          usableCashCents: latestSnapshot.usableCashCents,
          projectedExhaustionDay: latestSnapshot.projectedExhaustionDay,
          status: latestSnapshot.status,
          confidence: latestSnapshot.confidence,
          snapshotAt: latestSnapshot.snapshotAt,
        }
      })
    : null
  const spendLeakData = canViewSpendLeak ? await loadSpendLeakDashboard(user.id) : null
  const marginSummary = canViewMarginGuard ? await getMarginSummary(user.id) : null
  const marginTrendsComparison = canViewMarginGuard ? await getMarginTrends(user.id, undefined, "previous_period") : null
  const taxBufferSummary = canViewTaxBuffer ? await loadTaxBufferSummary(user.id) : null
  const commitGuardSummary = canViewCommitGuard
    ? await summarizeCommitGuard({
        userId: user.id,
        cashAvailableCents: taxBufferSummary?.availableCashCents ?? null,
        taxProtectedCashCents: taxBufferSummary?.totalRequiredReserveCents,
      })
    : null
  const ownersDigestSummary = canViewOwnersDigest ? await getCurrentOwnersDigest(user.id) : null
  const topSpendLeakModule = spendLeakData?.modules
    .filter((module) => module.findingCount > 0)
    .sort((left, right) => right.estimatedAnnualCents - left.estimatedAnnualCents)[0]
  const spendLeakSourceBreakdown = (spendLeakData?.findings ?? []).reduce(
    (summary, finding) => {
      if (getSpendLeakEvidenceSource(finding) === "expense_import") {
        summary.expenseImportFindings += 1
      } else {
        summary.providerSyncFindings += 1
      }
      return summary
    },
    { providerSyncFindings: 0, expenseImportFindings: 0 },
  )
  const financialSummary = buildFinancialOperationsSummary({
    activeInvoiceCount: activeInvoices.length,
    spendFindingCount: spendLeakData?.findings.length ?? 0,
    hasSpendLeakAccess: canViewSpendLeak,
    hasAccountingConnection: spendLeakData?.hasAccountingConnection ?? false,
    latestSyncAt: spendLeakData?.latestSyncAt ?? null,
  })
  const marginTrendDirection = marginTrendsComparison?.comparison.deltaGrossMarginPercent
  const marginTrendLabel =
    marginTrendDirection === null || marginTrendDirection === undefined
      ? "No prior trend available"
      : marginTrendDirection > 0
        ? `Improving +${marginTrendDirection.toFixed(1)} pp`
        : marginTrendDirection < 0
          ? `Declining ${marginTrendDirection.toFixed(1)} pp`
          : "Flat 0.0 pp"

  const heldInvoiceIds = computeHeldInvoiceIds(activeInvoices, chaseAllowance?.atCapacity ?? false)
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const costGuardAlerts = await withUserContext(user.id, async (tx) =>
    tx.costGuardAlert.findMany({
      where: { userId: user.id },
      orderBy: { detectedAt: "desc" },
      take: 5,
    }),
  )
  const taxBufferEvents = canViewTaxBuffer
    ? await withUserContext(user.id, async (tx) =>
        tx.taxBufferEvent.findMany({
          where: {
            userId: user.id,
            createdAt: { gte: sevenDaysAgo },
          },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
      )
    : []
  const costGuardNotifications = buildCostGuardNotificationPlan(
    costGuardAlerts.map((alert) => ({
      id: alert.id,
      severity: alert.severity as "critical" | "warning" | "watch" | "info",
      status: alert.status,
      title: alert.title,
      description: alert.description,
    })),
  )
  const dashboardNotifications = [
    ...costGuardNotifications.immediate,
    ...costGuardNotifications.daily,
    ...costGuardNotifications.weekly,
    ...taxBufferEvents
      .filter((event) => event.severity === "warning" || event.severity === "critical")
      .map((event) => ({
      id: `tax-buffer-${event.id}`,
      title: event.title,
      description: event.message,
      severity: event.severity as "critical" | "warning" | "watch" | "info",
      status: "open",
      })),
  ].slice(0, 3)
  const taxBufferDigest =
    taxBufferSummary && canViewTaxBuffer
      ? buildTaxBufferDigestSummary({
          period: "daily",
          userName: profile?.displayName ?? undefined,
          transferNowCents: taxBufferSummary.recommendation.transferNowCents,
          events: taxBufferEvents.map((event) => ({
            id: event.id,
            title: event.title,
            message: event.message,
            severity: event.severity as "critical" | "warning" | "watch" | "info",
            status: "open",
          })),
        })
      : null

  const cards = buildOverviewCards({
    activeInvoices,
    chaseAllowance,
    brokenPromiseCountsByDebtor,
    escalationThreshold,
    heldInvoiceCount: heldInvoiceIds.size,
    disputedInvoiceCount,
  })

  const currencySummaries = buildCurrencyDashboardSummaries({
    activeInvoices,
    paidInvoices,
    displayName: profile?.displayName ?? null,
    brokenPromiseCountsByDebtor,
    paidCountAllTime,
    manuallyResolvedCountAllTime,
    spendLeak: {
      hasAccess: canViewSpendLeak,
      hasAccountingConnection: spendLeakData?.hasAccountingConnection ?? false,
      findingCount: spendLeakData?.findings.length ?? 0,
      statusTitle: spendLeakData?.status.title ?? "SpendLeak locked",
      topModuleTitle: topSpendLeakModule?.title ?? null,
      topModuleFindingCount: topSpendLeakModule?.findingCount ?? 0,
      topModuleAnnualCents: topSpendLeakModule?.estimatedAnnualCents ?? 0,
      sourceBreakdown: spendLeakSourceBreakdown,
    },
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

  const cashPlanSummary = await withUserContext(user.id, async (tx) => {
    const [plan, settings] = await Promise.all([
      tx.cashPlan.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          currency: true,
          timezone: true,
          horizonWeeks: true,
          bufferTargetCents: true,
          status: true,
          updatedAt: true,
        },
      }),
      tx.cashPlanSetting.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          currency: true,
          timezone: true,
          horizonWeeks: true,
          bufferTargetCents: true,
          alertThresholdCents: true,
          reviewRole: true,
        },
      }),
    ])

    const latestSnapshot = plan
      ? await tx.cashPlanSnapshot.findFirst({
          where: { planId: plan.id },
          orderBy: { createdAt: "desc" },
          select: {
            inputHash: true,
            engineVersion: true,
            confidence: true,
            status: true,
            lowestClosingCashCents: true,
            bufferGapCents: true,
            weeks: true,
          },
        })
      : null

    const bufferTargetCents = settings?.bufferTargetCents ?? plan?.bufferTargetCents ?? defaultCashPlanSettings.bufferTargetCents

    if (latestSnapshot && Array.isArray(latestSnapshot.weeks)) {
      const weeks = latestSnapshot.weeks as unknown as CashPlanForecastWeek[]
      const forecast = {
        engineVersion: latestSnapshot.engineVersion,
        inputHash: latestSnapshot.inputHash,
        confidence: latestSnapshot.confidence,
        status: (latestSnapshot.status === "healthy" || latestSnapshot.status === "preliminary" || latestSnapshot.status === "stale"
          ? latestSnapshot.status
          : "preliminary") as "healthy" | "preliminary" | "stale",
        lowestClosingCashCents: latestSnapshot.lowestClosingCashCents,
        bufferGapCents: latestSnapshot.bufferGapCents,
        dataQualityIssues: [],
        inflows: [],
        outflows: [],
        weeks,
      }

      return buildCashPlanSummaryResponse({
        forecast,
        title: plan?.name ?? "Base plan",
      })
    }

    const forecast = buildCashPlanForecast({
      openingCashCents: 0,
      inflows: [],
      outflows: [],
      bufferTargetCents,
      now: new Date(),
    })

    return buildCashPlanSummaryResponse({
      forecast,
      title: plan?.name ?? "Base plan",
    })
  })

  const cashPlanStatus = cashPlanSummary ? buildCashPlanDashboardStatus({ summary: cashPlanSummary, hasPlan: true }) : null

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

      {currencySummaries[0]?.aiSummaryLines?.length ? (
        <AiSummaryCard lines={currencySummaries[0].aiSummaryLines} />
      ) : null}

      {cashPlanStatus ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">CashPlan status</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">{cashPlanStatus.title}</h2>
              <p className="mt-2 text-sm text-gray-600">{cashPlanStatus.summaryLabel}</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/settings/cash-plan"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open settings
              </Link>
              <Link
                href="/dashboard/settings/cash-plan"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Review forecast
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Confidence</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{cashPlanStatus.confidenceLabel}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Lowest cash</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{cashPlanStatus.lowestCashLabel}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Freshness</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{cashPlanStatus.freshnessLabel}</p>
            </div>
          </div>
          {cashPlanStatus.recommendedActions.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              {cashPlanStatus.recommendedActions.map((action) => (
                <li key={action} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-600" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {runwayGuardStatus ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">RunwayGuard</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">
                {runwayGuardStatus.runwayDays} days runway · {runwayGuardStatus.status}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Usable cash {formatAudCents(runwayGuardStatus.usableCashCents)} · Confidence {runwayGuardStatus.confidence.toFixed(2)} · Exit day {runwayGuardStatus.projectedExhaustionDay}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/runway-guard"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open module
              </Link>
              <Link
                href="/dashboard/settings/runway-guard"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Adjust settings
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Usable cash</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{formatAudCents(runwayGuardStatus.usableCashCents)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Runway</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{runwayGuardStatus.runwayDays} days</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Snapshot</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{new Date(runwayGuardStatus.snapshotAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
            </div>
          </div>
        </section>
      ) : null}

      {taxBufferSummary ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Tax Buffer</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Safe to spend {formatOptionalAudCents(taxBufferSummary.safeToSpendCents)}</h2>
              <p className="mt-2 text-sm text-gray-600">
                Required reserve {formatAudCents(taxBufferSummary.totalRequiredReserveCents)} · Reserved {formatAudCents(taxBufferSummary.totalReservedCents)}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/settings/tax-buffer"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open settings
              </Link>
              <Link
                href="/dashboard/tax-buffer"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open Tax Buffer
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Available cash</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{formatOptionalAudCents(taxBufferSummary.availableCashCents)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Required reserve</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{formatAudCents(taxBufferSummary.totalRequiredReserveCents)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Reserve gap</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{formatAudCents(taxBufferSummary.reserveGapCents)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Health</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{taxBufferSummary.healthStatus}</p>
            </div>
          </div>
          {taxBufferDigest && taxBufferDigest.count > 0 ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Tax Buffer digest</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{taxBufferDigest.headline}</p>
              {taxBufferDigest.actions.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-gray-700">
                  {taxBufferDigest.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {commitGuardSummary ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">CommitGuard</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Free cash {formatOptionalAudCents(commitGuardSummary.freeCash.freeCashCents)}</h2>
              <p className="mt-2 text-sm text-gray-600">
                Protected cash {formatAudCents(commitGuardSummary.freeCash.protectedCashCents)} · Status {commitGuardSummary.freeCash.status.replace("_", " ")}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/settings/commitguard"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open settings
              </Link>
              <Link
                href="/dashboard/commitguard"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open CommitGuard
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {commitGuardSummary.horizons.map((horizon) => (
              <div key={horizon.days} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">{horizon.days}-day commitments</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">{formatAudCents(horizon.totalCents)}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-600">
            Renewal items requiring attention: {commitGuardSummary.renewals.filter((item) => item.severity !== "info").length}
          </p>
        </section>
      ) : null}

      {ownersDigestSummary ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Owner&apos;s Digest</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">{formatOwnersDigestStatus(ownersDigestSummary.status)}</h2>
              <p className="mt-2 text-sm text-gray-600">{ownersDigestSummary.summary}</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/settings/owners-digest"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open settings
              </Link>
              <Link
                href="/dashboard/owners-digest"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open Owner&apos;s Digest
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Attention items</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {ownersDigestSummary.items.filter((item) => item.section === "needs_attention").length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Positive changes</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {ownersDigestSummary.items.filter((item) => item.section === "positive_changes").length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Data as of</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {ownersDigestSummary.dataAsOf ? ownersDigestSummary.dataAsOf.toLocaleDateString("en-AU") : "Pending"}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3">Account health</h2>
        <OverviewCards cards={cards} />
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">SpendLeak health</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {canViewSpendLeak && spendLeakData
                  ? `${spendLeakData.status.title} · ${spendLeakData.findings.length} finding${spendLeakData.findings.length === 1 ? "" : "s"}`
                  : "Locked on current tier"}
              </p>
              {canViewSpendLeak && spendLeakData ? (
                <p className="mt-1 text-xs text-gray-600">{spendLeakData.status.description}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-600">Upgrade to include spend-side leakage signals in account health.</p>
              )}
            </div>
            <Link
              href={buildSpendLeakOverviewHref(financialSummary.showUnlockCta, topSpendLeakModule?.id ?? null)}
              className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {financialSummary.showUnlockCta ? "Upgrade" : "Open"}
            </Link>
          </div>
          {canViewSpendLeak && spendLeakData && topSpendLeakModule ? (
            <p className="mt-2 text-xs text-gray-600">
              Top module: <span className="font-medium text-gray-900">{topSpendLeakModule.title}</span> with {topSpendLeakModule.findingCount} finding{topSpendLeakModule.findingCount === 1 ? "" : "s"}
              {topSpendLeakModule.estimatedAnnualCents > 0
                ? ` (${formatAudCents(topSpendLeakModule.estimatedAnnualCents)} potential annual impact).`
                : "."}
            </p>
          ) : null}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Financial operations summary</h2>
            <p className="mt-1 text-sm text-gray-600">
              Receivables momentum from InvoiceGuard plus spend-side signals from SpendLeak.
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
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {financialSummary.financialOperationCards.map((card) => (
              <div key={card.id} className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{card.value}</p>
                <p className="mt-1 text-xs text-gray-600">{card.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            Spend-side insights are not yet available on your current tier.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">RunwayGuard summary</h2>
            <p className="mt-1 text-sm text-gray-600">
              Usable cash, projected cash-out timing, and runway resilience across your current operating horizon.
            </p>
          </div>
          <Link
            href={canViewRunwayGuard ? "/dashboard/runway-guard" : "/dashboard?intent=runwayguard"}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {canViewRunwayGuard ? "Open RunwayGuard" : "Unlock RunwayGuard"}
          </Link>
        </div>
        {canViewRunwayGuard ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Usable cash</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">Monitoring</p>
              <p className="mt-1 text-xs text-gray-600">Updated from your active CashPlan and protected reserves</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Runway</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">Live forecast</p>
              <p className="mt-1 text-xs text-gray-600">Status and confidence are calculated in the module view</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Protected cash</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">Protected</p>
              <p className="mt-1 text-xs text-gray-600">Tax and reserve buffers are held outside the usable operating bucket</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Trend</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">Visible</p>
              <p className="mt-1 text-xs text-gray-600">Trend and material-change alerts update from saved snapshots</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            Upgrade to unlock RunwayGuard and review your usable cash runway, risk state, and cash-out forecast.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">MarginGuard summary</h2>
            <p className="mt-1 text-sm text-gray-600">
              Gross margin health against your target, with trend context from the prior period.
            </p>
          </div>
          <Link
            href={canViewMarginGuard ? "/dashboard/margin-guard" : "/dashboard?intent=marginguard"}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {canViewMarginGuard ? "Open MarginGuard" : "Unlock MarginGuard"}
          </Link>
        </div>
        {canViewMarginGuard && marginSummary ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Gross margin</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {marginSummary.grossMarginPercent === null ? "N/A" : `${marginSummary.grossMarginPercent.toFixed(1)}%`}
              </p>
              <p className="mt-1 text-xs text-gray-600">Current operating gross margin</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Target margin</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{marginSummary.targetGrossMarginPercent.toFixed(1)}%</p>
              <p className="mt-1 text-xs text-gray-600">Configured threshold baseline</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Trend direction</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{marginTrendLabel}</p>
              <p className="mt-1 text-xs text-gray-600">Compared with previous period</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Open alerts</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{marginSummary.alertsOpenCount}</p>
              <p className="mt-1 text-xs text-gray-600">Margin conditions requiring review</p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">
            Upgrade to unlock MarginGuard summary metrics and proactive margin alerts in your FinOps overview.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Cost Guard</h2>
            <p className="mt-1 text-sm text-gray-600">
              Baseline and forecast monitoring for unusual spending and month-end drift.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/cost-guard" className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              Overview
            </Link>
            <Link href="/dashboard/cost-guard/alerts" className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
              Alerts
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3">
          {financialSummary.costGuardForecastMessage ? (
            <>
              <p className="text-sm font-medium text-gray-900">{financialSummary.costGuardStatusLabel ?? "Cost Guard status"}</p>
              <p className="mt-1 text-sm text-gray-600">{financialSummary.costGuardForecastMessage}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900">Monitoring is ready</p>
              <p className="mt-1 text-sm text-gray-600">
                Set up your baseline windows and forecast inputs to start tracking supplier drift, category overrun, and month-end cost risk.
              </p>
            </>
          )}
        </div>

        {dashboardNotifications.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">Notifications</p>
            {dashboardNotifications.map((notification) => (
              <div key={notification.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                  <p className="mt-1 text-xs text-gray-600">{notification.description}</p>
                </div>
                <span className={[
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  notification.severity === "critical"
                    ? "bg-red-100 text-red-700"
                    : notification.severity === "warning"
                      ? "bg-amber-100 text-amber-700"
                      : notification.severity === "watch"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-blue-100 text-blue-700",
                ].join(" ")}>{notification.severity}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            No active Cost Guard notifications. Everything is tracking within the configured thresholds.
          </div>
        )}
      </section>

      {currencySummaries.map((summary) => (
        <CurrencySummarySection
          key={summary.currency}
          summary={summary}
          showCurrencyHeading={showCurrencyHeadings}
          showAiSummary={false}
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

