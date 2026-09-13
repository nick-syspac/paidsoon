import type { DepositGuardPaymentSummary } from "@/lib/depositGuard/jobDetail"
import type { DepositRequestSummary } from "@/lib/depositGuard/requests"
import type { CashPlanLineItemInput } from "@/lib/cashplan/engine"
import type { RunwayForecastPoint } from "@/lib/runwayGuard/foundation"

const DAY_MS = 24 * 60 * 60 * 1000

function toWeekIndex(now: Date, target: Date): number {
  return Math.max(0, Math.floor((target.getTime() - now.getTime()) / (7 * DAY_MS)))
}

export function buildDepositGuardJobDeepLink(jobId: string, requestId?: string | null): string {
  return requestId ? `/dashboard/deposit-guard/${jobId}#request-${requestId}` : `/dashboard/deposit-guard/${jobId}`
}

export function buildDepositGuardCashPlanLineItems(input: {
  now?: Date
  requests: DepositRequestSummary[]
  payments: DepositGuardPaymentSummary[]
}): { inflows: CashPlanLineItemInput[]; outflows: CashPlanLineItemInput[] } {
  const now = input.now ?? new Date()
  const paymentGroups = new Map<string, number>()

  for (const payment of input.payments) {
    if (payment.status !== "confirmed") continue
    const key = payment.depositRequestId ?? payment.id
    paymentGroups.set(key, (paymentGroups.get(key) ?? 0) + payment.amountCents)
  }

  const inflows: CashPlanLineItemInput[] = []

  for (const request of input.requests) {
    if (request.status === "cancelled" || request.status === "expired") continue

    const received = paymentGroups.get(request.id) ?? 0
    const remaining = Math.max(0, request.totalAmountCents - received)
    if (remaining <= 0) continue

    inflows.push({
      id: `depositguard:request:${request.id}`,
      kind: "inflow",
      amountCents: remaining,
      weekIndex: toWeekIndex(now, request.dueDate),
      confidence: request.status === "paid" ? 1 : request.status === "partially_paid" ? 0.9 : 0.75,
      sourceUpdatedAt: request.updatedAt,
      sourceSystem: "depositguard",
      sourceId: request.id,
      sourceHash: `${request.id}:${request.status}:${remaining}:${request.dueDate.toISOString()}`,
    })
  }

  for (const payment of input.payments) {
    if (payment.status !== "confirmed") continue

    const paymentDate = payment.paidAt ?? payment.createdAt
    inflows.push({
      id: `depositguard:payment:${payment.id}`,
      kind: "inflow",
      amountCents: payment.amountCents,
      weekIndex: toWeekIndex(now, paymentDate),
      confidence: 1,
      sourceUpdatedAt: payment.updatedAt,
      sourceSystem: "depositguard",
      sourceId: payment.id,
      sourceHash: `${payment.id}:${payment.amountCents}:${paymentDate.toISOString()}`,
    })
  }

  return { inflows, outflows: [] }
}

export function buildDepositGuardRunwayForecast(input: {
  openingCashCents: number
  requests: DepositRequestSummary[]
  payments: DepositGuardPaymentSummary[]
  now?: Date
  horizonWeeks?: number
}): RunwayForecastPoint[] {
  const now = input.now ?? new Date()
  const horizonWeeks = Math.max(1, Math.trunc(input.horizonWeeks ?? 13))
  const { inflows } = buildDepositGuardCashPlanLineItems({ now, requests: input.requests, payments: input.payments })
  const closingByWeek = new Map<number, number>()
  let cash = Math.max(0, Math.round(input.openingCashCents))

  for (let weekIndex = 0; weekIndex <= horizonWeeks; weekIndex += 1) {
    const inflow = inflows
      .filter((item) => item.weekIndex === weekIndex)
      .reduce((sum, item) => sum + item.amountCents, 0)
    cash += inflow
    closingByWeek.set(weekIndex, cash)
  }

  return Array.from(closingByWeek.entries()).map(([weekIndex, projectedCashCents]) => ({
    day: weekIndex * 7,
    projectedCashCents,
  }))
}

export function buildDepositGuardNotificationPlan(input: {
  jobs: Array<{
    id: string
    name: string
    workStatus: string
    paymentStatus: string
    commencementBlocked: boolean
  }>
  requests: Array<{
    id: string
    jobId: string
    status: string
    dueDate: Date
    paidAt: Date | null
    firstViewedAt: Date | null
    lastViewedAt: Date | null
  }>
}): {
  immediate: Array<{ id: string; eventType: string; title: string; message: string; href: string }>
  daily: Array<{ id: string; eventType: string; title: string; message: string; href: string }>
  weekly: Array<{ id: string; eventType: string; title: string; message: string; href: string }>
} {
  const immediate: Array<{ id: string; eventType: string; title: string; message: string; href: string }> = []
  const daily: Array<{ id: string; eventType: string; title: string; message: string; href: string }> = []
  const weekly: Array<{ id: string; eventType: string; title: string; message: string; href: string }> = []

  for (const job of input.jobs) {
    if (job.workStatus === "ready_to_start" && !job.commencementBlocked) {
      immediate.push({
        id: `depositguard:job-ready:${job.id}`,
        eventType: "job_ready_to_start",
        title: `${job.name} is ready to start`,
        message: "The required deposit has cleared and the job can begin.",
        href: buildDepositGuardJobDeepLink(job.id),
      })
    }
    if (job.paymentStatus === "overdue") {
      immediate.push({
        id: `depositguard:job-overdue:${job.id}`,
        eventType: "deposit_overdue",
        title: `${job.name} is overdue`,
        message: "Outstanding deposit cash is past due and needs follow-up.",
        href: buildDepositGuardJobDeepLink(job.id),
      })
    }
  }

  for (const request of input.requests) {
    const href = buildDepositGuardJobDeepLink(request.jobId, request.id)
    if (request.status === "viewed") {
      daily.push({
        id: `depositguard:request-viewed:${request.id}`,
        eventType: "request_viewed",
        title: "Request viewed",
        message: "The client has opened the deposit request.",
        href,
      })
    } else if (request.status === "partially_paid") {
      daily.push({
        id: `depositguard:request-partial:${request.id}`,
        eventType: "request_partially_paid",
        title: "Request partially paid",
        message: "A partial deposit payment has been received.",
        href,
      })
    } else if (request.status === "paid") {
      immediate.push({
        id: `depositguard:request-paid:${request.id}`,
        eventType: "request_paid",
        title: "Request paid",
        message: "The deposit request has been paid in full.",
        href,
      })
    } else if (request.status === "overdue") {
      immediate.push({
        id: `depositguard:request-overdue:${request.id}`,
        eventType: "request_overdue",
        title: "Request overdue",
        message: "The deposit request is overdue and should be chased.",
        href,
      })
    } else if (request.status === "failed") {
      immediate.push({
        id: `depositguard:request-failed:${request.id}`,
        eventType: "request_failed",
        title: "Request payment failed",
        message: "A payment attempt failed for this deposit request.",
        href,
      })
    }
  }

  if (input.requests.some((request) => request.status === "draft")) {
    weekly.push({
      id: "depositguard:draft-requests",
      eventType: "draft_requests",
      title: "Draft requests still need sending",
      message: "Some deposit requests are still in draft and can be sent from the job view.",
      href: "/dashboard/deposit-guard",
    })
  }

  return { immediate, daily, weekly }
}

export function buildDepositGuardRunwayImpact(input: {
  openingCashCents: number
  requests: DepositRequestSummary[]
  payments: DepositGuardPaymentSummary[]
  now?: Date
  horizonWeeks?: number
}): { forecast: RunwayForecastPoint[]; reasons: string[] } {
  const forecast = buildDepositGuardRunwayForecast(input)
  const openRequestCount = input.requests.filter((request) => request.status !== "cancelled" && request.status !== "expired").length
  const confirmedPayments = input.payments.filter((payment) => payment.status === "confirmed").length

  return {
    forecast,
    reasons: [
      `${openRequestCount} deposit request${openRequestCount === 1 ? " contributes" : " contribute"} to expected cash receipts.`,
      `${confirmedPayments} confirmed payment${confirmedPayments === 1 ? " has" : " have"} already landed in cash.`,
    ],
  }
}