import { withUserContext } from "@/lib/db/withUserContext"
import { getDepositGuardEntitlements } from "@/lib/depositGuard/entitlements"
import type {
  OwnersDigestMetric,
  OwnersDigestProviderResult,
  OwnersDigestSignal,
} from "@/lib/ownersDigest/types"

export {
  buildDepositGuardCashPlanLineItems,
  buildDepositGuardJobDeepLink,
  buildDepositGuardNotificationPlan,
  buildDepositGuardRunwayForecast,
  buildDepositGuardRunwayImpact,
} from "@/lib/depositGuard/integrationsCore"

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Math.abs(cents) / 100)
}

export async function loadDepositGuardOwnerDigestProvider(userId: string, now: Date): Promise<OwnersDigestProviderResult> {
  const entitlements = await getDepositGuardEntitlements(userId)
  if (!entitlements.hasAccess) {
    return {
      source: "depositguard",
      status: "not_entitled",
      signals: [] as OwnersDigestSignal[],
      metrics: [] as OwnersDigestMetric[],
      dataAsOf: null,
      stale: false,
      entitled: false,
      configured: false,
      available: false,
    }
  }

  const [jobs, requests, payments] = await withUserContext(userId, async (tx) => {
    const [jobRows, requestRows, paymentRows] = await Promise.all([
      tx.depositGuardJob.findMany({
        where: { userId, archivedAt: null },
        select: { id: true, name: true, workStatus: true, paymentStatus: true, commencementBlocked: true, outstandingAmountCents: true },
      }),
      tx.depositRequest.findMany({
        where: { userId },
        select: { id: true, jobId: true, status: true, totalAmountCents: true, dueDate: true, paidAt: true, firstViewedAt: true, lastViewedAt: true },
      }),
      tx.depositPayment.findMany({
        where: { userId, status: "confirmed" },
        select: { id: true, depositRequestId: true, amountCents: true },
      }),
    ])

    return [jobRows, requestRows, paymentRows] as const
  })

  const blockedJobs = jobs.filter((job) => job.commencementBlocked).length
  const overdueRequests = requests.filter((request) => request.status === "overdue").length
  const partialRequests = requests.filter((request) => request.status === "partially_paid").length
  const paymentTotals = new Map<string, number>()
  for (const payment of payments) {
    if (!payment.depositRequestId) continue
    paymentTotals.set(payment.depositRequestId, (paymentTotals.get(payment.depositRequestId) ?? 0) + payment.amountCents)
  }
  const outstandingCents = requests.reduce((sum, request) => {
    const paidCents = paymentTotals.get(request.id) ?? 0
    return sum + Math.max(0, request.totalAmountCents - paidCents)
  }, 0)
  const signals: OwnersDigestSignal[] = []

  if (blockedJobs > 0) {
    signals.push({
      id: `depositguard-blocked-${userId}`,
      source: "depositguard",
      signalType: "DEPOSIT_BLOCKED",
      title: `${blockedJobs} deposit job${blockedJobs === 1 ? " is" : "s are"} blocked`,
      summary: "A required deposit has not yet cleared for one or more active jobs.",
      severity: blockedJobs >= 3 ? "warning" : "info",
      recommendedAction: "Review the blocked jobs and confirm whether the request has been sent or paid.",
      actionUrl: "/dashboard/deposit-guard",
      whyItMatters: "Blocked starts reduce delivery capacity until the deposit is collected.",
      financialImpactCents: outstandingCents,
      currentValue: blockedJobs,
      detectedAt: now,
      correlationKey: "depositguard:blocked",
    })
  }

  if (overdueRequests > 0) {
    signals.push({
      id: `depositguard-overdue-${userId}`,
      source: "depositguard",
      signalType: "DEPOSIT_OVERDUE",
      title: `${overdueRequests} deposit request${overdueRequests === 1 ? " is" : "s are"} overdue`,
      summary: "Some deposit requests have passed their due dates and should be followed up.",
      severity: overdueRequests >= 2 ? "warning" : "info",
      recommendedAction: "Send a follow-up reminder or record the payment if it has been received.",
      actionUrl: "/dashboard/deposit-guard",
      whyItMatters: "Overdue requests are the earliest sign of deposit cash slipping.",
      financialImpactCents: outstandingCents,
      currentValue: overdueRequests,
      detectedAt: now,
      correlationKey: "depositguard:overdue",
    })
  }

  if (partialRequests > 0) {
    signals.push({
      id: `depositguard-partial-${userId}`,
      source: "depositguard",
      signalType: "DEPOSIT_PARTIAL",
      title: `${partialRequests} deposit request${partialRequests === 1 ? " has" : " have"} partial payment`,
      summary: "A partial payment has been applied and the remaining balance is still outstanding.",
      severity: "positive",
      recommendedAction: "Check the remaining balance and decide whether to send a top-up request.",
      actionUrl: "/dashboard/deposit-guard",
      whyItMatters: "Partial payments improve cash but can still leave a commencement gap.",
      financialImpactCents: outstandingCents,
      currentValue: partialRequests,
      detectedAt: now,
      correlationKey: "depositguard:partial",
    })
  }

  return {
    source: "depositguard",
    status: jobs.length > 0 || requests.length > 0 ? "complete" : "not_configured",
    signals,
    metrics: [
      {
        key: "deposit_guard_active_jobs",
        label: "DepositGuard jobs",
        section: "key_numbers",
        unit: "count",
        displayValue: String(jobs.length),
        numericValue: jobs.length,
        sortOrder: 8,
      },
      {
        key: "deposit_guard_overdue_requests",
        label: "Overdue deposits",
        section: "key_numbers",
        unit: "count",
        displayValue: String(overdueRequests),
        numericValue: overdueRequests,
        sortOrder: 9,
      },
      {
        key: "deposit_guard_outstanding",
        label: "Outstanding deposits",
        section: "key_numbers",
        unit: "currency_cents",
        displayValue: formatCurrency(outstandingCents),
        monetaryValueCents: outstandingCents,
        sortOrder: 10,
      },
    ],
    dataAsOf: now,
    stale: false,
    entitled: true,
    configured: jobs.length > 0 || requests.length > 0,
    available: true,
  }
}