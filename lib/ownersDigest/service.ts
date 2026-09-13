import { Prisma } from "@/lib/generated/prisma/client"
import { withUserContext } from "@/lib/db/withUserContext"
import { getMarginSummary } from "@/lib/marginguard/service"
import { loadSpendLeakDashboard } from "@/lib/dashboard/loadSpendLeakDashboard"
import { summarizeCommitGuard } from "@/lib/commitguard/service"
import { loadTaxBufferSummary } from "@/lib/taxBuffer/service"
import { loadDepositGuardOwnerDigestProvider } from "@/lib/depositGuard/integrations"
import { getOwnersDigestEntitlements, requireOwnersDigestCoreAccess, requireOwnersDigestHistoryAccess } from "@/lib/ownersDigest/entitlements"
import {
  getOrCreateOwnersDigestSettings,
  OWNERS_DIGEST_DEFAULT_SETTINGS,
  type SaveOwnersDigestSettingsInput,
  saveOwnersDigestSettings,
} from "@/lib/ownersDigest/settings"
import { runOwnersDigestProviderRegistry, type OwnersDigestSignalProvider } from "@/lib/ownersDigest/providers"
import type {
  OwnersDigestFrequency,
  OwnersDigestGenerationResult,
  OwnersDigestHistoryEntry,
  OwnersDigestItem,
  OwnersDigestMetric,
  OwnersDigestProviderResult,
  OwnersDigestSection,
  OwnersDigestSettingsSnapshot,
  OwnersDigestSignal,
  OwnersDigestSnapshotRecord,
  OwnersDigestSource,
  OwnersDigestStatus,
} from "@/lib/ownersDigest/types"
import { hasPlanFeature } from "@/lib/subscriptionPlans"

const ACTIVE_INVOICE_STATUSES = ["pending", "paused", "snoozed", "sequence_complete", "disputed"]
const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000

function formatCurrency(cents: number | null | undefined, currency: string = "AUD"): string {
  const amount = Math.abs(Math.round(cents ?? 0)) / 100
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available"
  return `${value.toFixed(1)}%`
}

function formatWeeks(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not available"
  return `${Math.round(value)} weeks`
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function startOfUtcDay(date: Date): Date {
  const next = new Date(date)
  next.setUTCHours(0, 0, 0, 0)
  return next
}

export function getOwnersDigestPeriodBounds(frequency: OwnersDigestFrequency, now: Date = new Date()): {
  frequency: Exclude<OwnersDigestFrequency, "off">
  periodLabel: string
  periodStart: Date
  periodEnd: Date
} {
  const safeFrequency = frequency === "off" ? "weekly" : frequency
  const periodStart = startOfUtcDay(now)

  if (safeFrequency === "daily") {
    const periodEnd = new Date(periodStart)
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 1)
    periodEnd.setUTCMilliseconds(periodEnd.getUTCMilliseconds() - 1)
    return {
      frequency: safeFrequency,
      periodLabel: formatDayLabel(periodStart),
      periodStart,
      periodEnd,
    }
  }

  if (safeFrequency === "monthly") {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    monthEnd.setUTCMilliseconds(monthEnd.getUTCMilliseconds() - 1)
    return {
      frequency: safeFrequency,
      periodLabel: monthStart.toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
      periodStart: monthStart,
      periodEnd: monthEnd,
    }
  }

  const day = periodStart.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  periodStart.setUTCDate(periodStart.getUTCDate() + offset)
  const periodEnd = new Date(periodStart)
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 7)
  periodEnd.setUTCMilliseconds(periodEnd.getUTCMilliseconds() - 1)

  return {
    frequency: safeFrequency,
    periodLabel: `${formatDayLabel(periodStart)} to ${formatDayLabel(periodEnd)}`,
    periodStart,
    periodEnd,
  }
}

function isStaleDate(date: Date | null | undefined, now: Date): boolean {
  return date instanceof Date ? now.getTime() - date.getTime() > STALE_THRESHOLD_MS : false
}

function sectionForSeverity(severity: OwnersDigestSignal["severity"]): OwnersDigestSection {
  if (severity === "critical" || severity === "warning") return "needs_attention"
  if (severity === "opportunity") return "opportunities"
  if (severity === "positive") return "positive_changes"
  return "info"
}

function severityWeight(severity: OwnersDigestSignal["severity"]): number {
  switch (severity) {
    case "critical":
      return 50
    case "warning":
      return 35
    case "opportunity":
      return 25
    case "positive":
      return 10
    case "info":
      return 5
  }
}

function signalMateriality(signal: OwnersDigestSignal): number {
  return Math.max(0, Math.round(Math.abs(signal.financialImpactCents ?? 0) / 1000))
}

export function computeOwnersDigestPriorityScore(signal: OwnersDigestSignal): number {
  let score = severityWeight(signal.severity) + Math.min(signalMateriality(signal), 40)
  const changePercent = Math.abs(signal.changePercent ?? 0)
  if (changePercent >= 25) score += 10
  if (changePercent >= 10) score += 5
  return score
}

function compareSignals(left: OwnersDigestItem, right: OwnersDigestItem): number {
  if (right.priorityScore !== left.priorityScore) {
    return right.priorityScore - left.priorityScore
  }
  return right.detectedAt.getTime() - left.detectedAt.getTime()
}

export function shouldSurfaceOwnersDigestSignal(signal: OwnersDigestSignal, settings: OwnersDigestSettingsSnapshot): boolean {
  if (signal.severity === "critical") return true
  if (signal.severity === "positive" || signal.severity === "info") {
    return Math.abs(signal.financialImpactCents ?? 0) >= settings.minimumMaterialityCents || signal.changePercent != null
  }
  const impact = Math.abs(signal.financialImpactCents ?? 0)
  return impact >= settings.minimumMaterialityCents || signal.changePercent != null
}

export function dedupeOwnersDigestSignals(signals: OwnersDigestSignal[]): OwnersDigestItem[] {
  const merged = new Map<string, OwnersDigestItem>()

  for (const signal of signals) {
    const key = signal.correlationKey ?? `${signal.source}:${signal.signalType}:${signal.entityId ?? signal.title}`
    const next: OwnersDigestItem = {
      ...signal,
      section: sectionForSeverity(signal.severity),
      priorityScore: computeOwnersDigestPriorityScore(signal),
      contributingSources: [signal.source],
    }
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, next)
      continue
    }

    const winner = existing.priorityScore >= next.priorityScore ? existing : next
    winner.contributingSources = Array.from(new Set([...existing.contributingSources, ...next.contributingSources]))
    if (next.priorityScore > existing.priorityScore) {
      winner.summary = next.summary
      winner.title = next.title
      winner.severity = next.severity
      winner.priorityScore = next.priorityScore
      winner.section = next.section
      winner.whyItMatters = next.whyItMatters ?? winner.whyItMatters
      winner.recommendedAction = next.recommendedAction ?? winner.recommendedAction
      winner.actionUrl = next.actionUrl ?? winner.actionUrl
      winner.financialImpactCents = Math.max(
        existing.financialImpactCents ?? 0,
        next.financialImpactCents ?? 0,
      )
    }
    merged.set(key, winner)
  }

  return Array.from(merged.values()).sort(compareSignals)
}

export function determineOwnersDigestStatus(items: OwnersDigestItem[]): OwnersDigestStatus {
  if (items.some((item) => item.severity === "critical")) return "critical"
  if (items.some((item) => item.severity === "warning" && item.priorityScore >= 45)) return "action_required"
  if (items.some((item) => item.severity === "warning")) return "watch"
  return "healthy"
}

function completenessStatus(providers: OwnersDigestProviderResult[]): OwnersDigestSnapshotRecord["completenessStatus"] {
  if (providers.some((provider) => provider.status === "partial" || provider.status === "unavailable")) return "partial"
  if (providers.some((provider) => provider.stale)) return "stale"
  if (providers.every((provider) => provider.status === "not_configured" || provider.status === "not_entitled")) {
    return "insufficient_data"
  }
  return "complete"
}

function buildCompletenessSummary(providers: OwnersDigestProviderResult[]): string | null {
  const staleProviders = providers.filter((provider) => provider.stale)
  const unavailableProviders = providers.filter(
    (provider) => provider.status === "partial" || provider.status === "unavailable",
  )
  const allUnavailableOrUnconfigured = providers.every(
    (provider) =>
      provider.status === "not_configured" || provider.status === "not_entitled" || provider.status === "unavailable",
  )

  if (allUnavailableOrUnconfigured) {
    return "Connect your accounting data or import transactions to generate your Owner's Digest."
  }

  if (staleProviders.length === 0 && unavailableProviders.length === 0) return null
  if (unavailableProviders.length > 0) {
    return `${unavailableProviders.length} module${unavailableProviders.length === 1 ? " was" : "s were"} unavailable when this digest was generated.`
  }
  return `${staleProviders.length} module${staleProviders.length === 1 ? " has" : "s have"} stale source data.`
}

function buildStatusReason(status: OwnersDigestStatus, items: OwnersDigestItem[]): string | null {
  const firstAttention = items.find((item) => item.section === "needs_attention")
  if (!firstAttention) {
    return status === "healthy" ? "No significant financial issues require attention right now." : null
  }
  return firstAttention.title
}

export function buildOwnersDigestSummary(status: OwnersDigestStatus, items: OwnersDigestItem[]): string {
  const attentionCount = items.filter((item) => item.section === "needs_attention").length
  const opportunityCount = items.filter((item) => item.section === "opportunities").length
  const positiveCount = items.filter((item) => item.section === "positive_changes").length
  const label = status === "healthy"
    ? "Everything looks on track."
    : status === "watch"
      ? "Your business remains stable, but a few issues need review."
      : status === "action_required"
        ? "Several issues need near-term attention."
        : "Immediate financial attention is required."

  return [
    label,
    attentionCount > 0 ? `${attentionCount} item${attentionCount === 1 ? " needs" : "s need"} attention.` : null,
    opportunityCount > 0 ? `${opportunityCount} savings opportunit${opportunityCount === 1 ? "y is" : "ies are"} available.` : null,
    positiveCount > 0 ? `${positiveCount} positive change${positiveCount === 1 ? " was" : "s were"} identified.` : null,
  ].filter((value): value is string => Boolean(value)).join(" ")
}

function latestDataAsOf(providers: OwnersDigestProviderResult[]): Date | null {
  const dates = providers
    .map((provider) => provider.dataAsOf)
    .filter((value): value is Date => value instanceof Date)
  if (dates.length === 0) return null
  return dates.reduce((latest, value) => (value > latest ? value : latest), dates[0])
}

export async function loadPaidSoonProvider(
  userId: string,
  now: Date,
): Promise<OwnersDigestProviderResult> {
  const facts = await withUserContext(userId, async (tx) => {
    const rows = await tx.trackedInvoice.findMany({
      where: { userId, status: { in: ACTIVE_INVOICE_STATUSES } },
      select: {
        id: true,
        updatedAt: true,
        status: true,
        financialInvoice: {
          select: {
            amountDueCents: true,
            dueDate: true,
            invoiceNumber: true,
            contact: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    return rows
  })

  const overdueRows = facts.filter((row) => row.financialInvoice.dueDate <= now)
  const overdueThirty = overdueRows.filter((row) => {
    const daysOverdue = Math.floor((now.getTime() - row.financialInvoice.dueDate.getTime()) / (1000 * 60 * 60 * 24))
    return daysOverdue >= 30
  })
  const overdueCents = overdueRows.reduce((sum, row) => sum + row.financialInvoice.amountDueCents, 0)
  const overdueThirtyCents = overdueThirty.reduce((sum, row) => sum + row.financialInvoice.amountDueCents, 0)
  const dataAsOf = facts[0]?.updatedAt ?? null
  const signals: OwnersDigestSignal[] = []
  const metrics: OwnersDigestMetric[] = facts.length > 0
    ? [
        {
          key: "overdue_invoices",
          label: "Overdue invoices",
          section: "key_numbers",
          unit: "currency_cents",
          displayValue: formatCurrency(overdueCents),
          monetaryValueCents: overdueCents,
          sortOrder: 1,
        },
      ]
    : []

  if (facts.length === 0) {
    return {
      source: "paidsoon",
      status: "not_configured",
      signals: [],
      metrics: [],
      dataAsOf: null,
      stale: false,
      entitled: true,
      configured: false,
      available: true,
    }
  }

  if (overdueThirty.length > 0) {
    signals.push({
      id: `paidsoon-overdue-${overdueRows.length}`,
      source: "paidsoon",
      signalType: "OVERDUE_30_PLUS",
      title: `${formatCurrency(overdueThirtyCents)} of invoices are 30+ days overdue`,
      summary: `${formatCount(overdueThirty.length)} overdue invoice${overdueThirty.length === 1 ? " is" : "s are"} more than 30 days late.`,
      severity: overdueThirtyCents >= 20_000 ? "critical" : "warning",
      recommendedAction: "Review the oldest overdue invoices and follow up the largest balances.",
      actionUrl: "/dashboard/invoices",
      whyItMatters: "Late receivables increase cash pressure and delay collections.",
      financialImpactCents: overdueThirtyCents,
      currentValue: overdueThirtyCents,
      detectedAt: dataAsOf ?? now,
      correlationKey: overdueThirtyCents >= 20_000 ? "cash_pressure" : null,
      metadata: { overdueCount: overdueThirty.length },
    })
  } else if (overdueCents === 0) {
    signals.push({
      id: "paidsoon-overdue-clear",
      source: "paidsoon",
      signalType: "OVERDUE_CLEAR",
      title: "No overdue invoices require attention",
      summary: "Receivables are currently on track with no overdue balances.",
      severity: "positive",
      financialImpactCents: 0,
      detectedAt: dataAsOf ?? now,
    })
  }

  return {
    source: "paidsoon",
    status: "complete",
    signals,
    metrics,
    dataAsOf,
    stale: isStaleDate(dataAsOf, now),
    entitled: true,
    configured: facts.length > 0,
    available: true,
  }
}

export async function loadSpendLeakProvider(userId: string, now: Date): Promise<OwnersDigestProviderResult> {
  const dashboard = await loadSpendLeakDashboard(userId)
  const annualSavings = dashboard.findings.reduce((sum, finding) => sum + Math.max(0, finding.estimatedAnnualCents ?? 0), 0)
  const signals: OwnersDigestSignal[] = []
  if (annualSavings > 0) {
    signals.push({
      id: `spendleak-savings-${annualSavings}`,
      source: "spendleak",
      signalType: "POTENTIAL_SAVINGS",
      title: `Potential recurring savings of ${formatCurrency(annualSavings)} per year`,
      summary: `${formatCount(dashboard.findings.length)} spend finding${dashboard.findings.length === 1 ? " suggests" : "s suggest"} possible savings or waste reduction.`,
      severity: "opportunity",
      recommendedAction: "Review SpendLeak findings and confirm which subscriptions or costs can be reduced.",
      actionUrl: "/dashboard/spendleak",
      whyItMatters: "Recurring savings improve cash flow without new revenue.",
      financialImpactCents: annualSavings,
      currentValue: annualSavings,
      detectedAt: dashboard.latestSyncAt ?? now,
    })
  }

  return {
    source: "spendleak",
    status: dashboard.hasAccountingConnection ? "complete" : "not_configured",
    signals,
    metrics: annualSavings > 0
      ? [{
          key: "potential_savings_annual",
          label: "Potential savings",
          section: "key_numbers",
          unit: "currency_cents",
          displayValue: `${formatCurrency(annualSavings)}/year`,
          monetaryValueCents: annualSavings,
          sortOrder: 5,
        }]
      : [],
    dataAsOf: dashboard.latestSyncAt,
    stale: dashboard.isStale,
    entitled: true,
    configured: dashboard.hasAccountingConnection,
    available: true,
  }
}

export async function loadCostGuardProvider(userId: string, now: Date): Promise<OwnersDigestProviderResult> {
  const alerts = await withUserContext(userId, (tx) =>
    tx.costGuardAlert.findMany({
      where: { userId, status: { notIn: ["resolved", "ignored", "snoozed"] } },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      take: 5,
    }),
  )
  const first = alerts[0] ?? null
  const highestImpact = alerts.reduce((max, alert) => Math.max(max, Math.abs(alert.varianceAmountCents)), 0)
  const signals: OwnersDigestSignal[] = first
    ? [{
        id: `costguard-${first.id}`,
        source: "costguard",
        signalType: first.alertType,
        title: first.title,
        summary: first.description,
        severity: first.severity === "critical" ? "critical" : "warning",
        recommendedAction: "Review the latest Cost Guard alert and confirm whether the change needs intervention.",
        actionUrl: "/dashboard/cost-guard",
        whyItMatters: "Unexpected cost drift can reduce cash and margin quickly.",
        financialImpactCents: highestImpact,
        currentValue: first.actualAmountCents,
        previousValue: first.baselineAmountCents,
        changeValue: first.varianceAmountCents,
        changePercent: first.variancePercent,
        detectedAt: first.detectedAt,
      }]
    : []

  return {
    source: "costguard",
    status: alerts.length > 0 ? "complete" : "not_configured",
    signals,
    metrics: [],
    dataAsOf: first?.detectedAt ?? null,
    stale: isStaleDate(first?.detectedAt ?? null, now),
    entitled: true,
    configured: alerts.length > 0,
    available: true,
  }
}

export async function loadCashPlanProvider(userId: string, now: Date): Promise<OwnersDigestProviderResult> {
  const snapshot = await withUserContext(userId, (tx) =>
    tx.cashPlanSnapshot.findFirst({
      where: { plan: { userId } },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        confidence: true,
        status: true,
        lowestClosingCashCents: true,
        bufferGapCents: true,
      },
    }),
  )

  const signals: OwnersDigestSignal[] = []
  if (snapshot && snapshot.bufferGapCents < 0) {
    signals.push({
      id: `cashplan-buffer-${snapshot.createdAt.toISOString()}`,
      source: "cashplan",
      signalType: "BUFFER_GAP",
      title: `Cash forecast falls ${formatCurrency(Math.abs(snapshot.bufferGapCents))} below target buffer`,
      summary: `The latest cash forecast shows a projected shortfall against the target buffer.`,
      severity: Math.abs(snapshot.bufferGapCents) >= 20_000 ? "critical" : "warning",
      recommendedAction: "Review the cash plan and confirm near-term inflows and outflows.",
      actionUrl: "/dashboard/settings/cash-plan",
      whyItMatters: "Buffer shortfalls reduce flexibility if receipts land late.",
      financialImpactCents: Math.abs(snapshot.bufferGapCents),
      currentValue: snapshot.lowestClosingCashCents,
      changeValue: snapshot.bufferGapCents,
      detectedAt: snapshot.createdAt,
      correlationKey: "cash_pressure",
    })
  }

  return {
    source: "cashplan",
    status: snapshot ? "complete" : "not_configured",
    signals,
    metrics: snapshot
      ? [{
          key: "cashplan_lowest_cash",
          label: "Lowest projected cash",
          section: "key_numbers",
          unit: "currency_cents",
          displayValue: formatCurrency(snapshot.lowestClosingCashCents),
          monetaryValueCents: snapshot.lowestClosingCashCents,
          sortOrder: 2,
        }]
      : [],
    dataAsOf: snapshot?.createdAt ?? null,
    stale: isStaleDate(snapshot?.createdAt ?? null, now),
    entitled: true,
    configured: Boolean(snapshot),
    available: true,
  }
}

export async function loadTaxBufferProvider(userId: string, now: Date): Promise<OwnersDigestProviderResult> {
  const summary = await loadTaxBufferSummary(userId)
  const reserveGapCents = Math.max(0, summary.reserveGapCents)
  const isConfigured = summary.categories.length > 0
  const signals: OwnersDigestSignal[] = []

  if (reserveGapCents > 0) {
    signals.push({
      id: "taxbuffer-reserve-gap",
      source: "taxbuffer",
      signalType: "RESERVE_GAP",
      title: `Tax reserve is ${formatCurrency(reserveGapCents)} below target`,
      summary: `The current tax buffer is underfunded against the latest reserve estimate.`,
      severity: reserveGapCents >= 20_000 ? "critical" : "warning",
      recommendedAction: "Review the Tax Buffer reserve target and transfer funds if appropriate.",
      actionUrl: "/dashboard/tax-buffer",
      whyItMatters: "Tax obligations still need funding even when cash appears available.",
      financialImpactCents: reserveGapCents,
      currentValue: summary.totalReservedCents,
      previousValue: summary.totalRequiredReserveCents,
      changeValue: reserveGapCents,
      detectedAt: now,
      correlationKey: reserveGapCents >= 20_000 ? "cash_pressure" : null,
    })
  }

  return {
    source: "taxbuffer",
    status: isConfigured ? "complete" : "not_configured",
    signals,
    metrics: [{
      key: "tax_buffer_gap",
      label: "Tax buffer",
      section: "key_numbers",
      unit: "currency_cents",
      displayValue: reserveGapCents > 0 ? `${formatCurrency(summary.totalReservedCents)} reserved` : "On target",
      monetaryValueCents: summary.totalReservedCents,
      previousMonetaryValueCents: summary.totalRequiredReserveCents,
      changeMonetaryValueCents: reserveGapCents,
      sortOrder: 4,
    }],
    dataAsOf: now,
    stale: false,
    entitled: true,
    configured: isConfigured,
    available: true,
  }
}

export async function loadCommitGuardProvider(userId: string, now: Date): Promise<OwnersDigestProviderResult> {
  const taxBufferSummary = await loadTaxBufferSummary(userId)
  const summary = await summarizeCommitGuard({
    userId,
    cashAvailableCents: taxBufferSummary.availableCashCents ?? null,
    taxProtectedCashCents: taxBufferSummary.totalRequiredReserveCents,
  })
  const signals: OwnersDigestSignal[] = []
  if (summary.freeCash.status === "shortfall" || summary.freeCash.status === "at_risk") {
    signals.push({
      id: "commitguard-free-cash",
      source: "commitguard",
      signalType: "FREE_CASH_RISK",
      title: `Free cash is ${formatCurrency(summary.freeCash.freeCashCents)} after protected commitments`,
      summary: `Protected cash commitments are reducing available free cash in the current outlook.`,
      severity: summary.freeCash.status === "shortfall" ? "critical" : "warning",
      recommendedAction: "Review near-term commitments and protect only the amounts that are still required.",
      actionUrl: "/dashboard/commitguard",
      whyItMatters: "Committed outflows can create cash pressure before invoices are collected.",
      financialImpactCents: Math.abs(summary.freeCash.protectedCashCents),
      currentValue: summary.freeCash.freeCashCents,
      detectedAt: now,
      correlationKey: "cash_pressure",
    })
  }

  return {
    source: "commitguard",
    status: summary.settings.enabled ? "complete" : "not_configured",
    signals,
    metrics: [{
      key: "free_cash",
      label: "Free cash",
      section: "key_numbers",
      unit: "currency_cents",
      displayValue: formatCurrency(summary.freeCash.freeCashCents),
      monetaryValueCents: summary.freeCash.freeCashCents,
      sortOrder: 3,
    }],
    dataAsOf: now,
    stale: false,
    entitled: true,
    configured: summary.settings.enabled,
    available: true,
  }
}

export async function loadMarginGuardProvider(userId: string, now: Date): Promise<OwnersDigestProviderResult> {
  const summary = await getMarginSummary(userId)
  const signals: OwnersDigestSignal[] = []
  if (summary.status === "critical" || summary.status === "warning") {
    signals.push({
      id: "marginguard-status",
      source: "marginguard",
      signalType: "MARGIN_RISK",
      title: `Gross margin is ${formatPercent(summary.grossMarginPercent)}`,
      summary: `The latest margin snapshot is below the configured target threshold.`,
      severity: summary.status === "critical" ? "critical" : "warning",
      recommendedAction: "Review MarginGuard breakdowns to confirm which costs or customers are driving the decline.",
      actionUrl: "/dashboard/margin-guard",
      whyItMatters: "Margin deterioration reduces the cash generated by each dollar of revenue.",
      financialImpactCents: summary.grossProfitCents,
      currentValue: summary.grossMarginPercent,
      detectedAt: now,
    })
  } else if (summary.status === "healthy") {
    signals.push({
      id: "marginguard-positive",
      source: "marginguard",
      signalType: "MARGIN_HEALTHY",
      title: `Gross margin is holding at ${formatPercent(summary.grossMarginPercent)}`,
      summary: `The latest margin snapshot remains within the configured healthy range.`,
      severity: "positive",
      financialImpactCents: summary.grossProfitCents,
      currentValue: summary.grossMarginPercent,
      detectedAt: now,
    })
  }

  return {
    source: "marginguard",
    status: summary.revenueCents > 0 || summary.completenessPercent > 0 ? "complete" : "not_configured",
    signals,
    metrics: [{
      key: "gross_margin",
      label: "Gross margin",
      section: "key_numbers",
      unit: "percent",
      displayValue: formatPercent(summary.grossMarginPercent),
      numericValue: summary.grossMarginPercent,
      sortOrder: 6,
    }],
    dataAsOf: now,
    stale: false,
    entitled: true,
    configured: summary.revenueCents > 0 || summary.completenessPercent > 0,
    available: true,
  }
}

export async function loadRunwayGuardProvider(userId: string, now: Date): Promise<OwnersDigestProviderResult> {
  const snapshot = await withUserContext(userId, (tx) =>
    tx.runwayGuardSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotAt: "desc" },
      select: {
        snapshotAt: true,
        runwayDays: true,
        usableCashCents: true,
        status: true,
      },
    }),
  )
  const signals: OwnersDigestSignal[] = []
  if (snapshot && (snapshot.status === "critical" || snapshot.status === "warning" || snapshot.status === "watch")) {
    signals.push({
      id: `runwayguard-${snapshot.snapshotAt.toISOString()}`,
      source: "runwayguard",
      signalType: "RUNWAY_STATUS",
      title: `Cash runway is ${formatWeeks(snapshot.runwayDays / 7)}`,
      summary: `The latest runway snapshot projects ${Math.max(0, snapshot.runwayDays)} days of usable cash.`,
      severity:
        snapshot.status === "critical"
          ? "critical"
          : snapshot.status === "warning"
            ? "warning"
            : "info",
      recommendedAction: "Review RunwayGuard assumptions and confirm the current burn outlook.",
      actionUrl: "/dashboard/runway-guard",
      whyItMatters: "Runway indicates how long cash can support current operating conditions.",
      financialImpactCents: snapshot.usableCashCents,
      currentValue: snapshot.runwayDays,
      detectedAt: snapshot.snapshotAt,
      correlationKey: snapshot.status === "critical" || snapshot.status === "warning" ? "cash_pressure" : null,
    })
  }

  return {
    source: "runwayguard",
    status: snapshot ? "complete" : "not_configured",
    signals,
    metrics: snapshot
      ? [{
          key: "cash_runway",
          label: "Cash runway",
          section: "key_numbers",
          unit: "weeks",
          displayValue: formatWeeks(snapshot.runwayDays / 7),
          numericValue: snapshot.runwayDays / 7,
          sortOrder: 7,
        }]
      : [],
    dataAsOf: snapshot?.snapshotAt ?? null,
    stale: isStaleDate(snapshot?.snapshotAt ?? null, now),
    entitled: true,
    configured: Boolean(snapshot),
    available: true,
  }
}

async function collectProviderResults(
  userId: string,
  now: Date,
): Promise<OwnersDigestProviderResult[]> {
  const entitlements = await getOwnersDigestEntitlements(userId)
  const providers: OwnersDigestSignalProvider[] = [
    { source: "paidsoon", load: () => loadPaidSoonProvider(userId, now) },
  ]

  if (hasPlanFeature(entitlements.tier, "accounting_integrations")) {
    providers.push({ source: "spendleak", load: () => loadSpendLeakProvider(userId, now) })
    providers.push({ source: "costguard", load: () => loadCostGuardProvider(userId, now) })
    providers.push({ source: "cashplan", load: () => loadCashPlanProvider(userId, now) })
  }
  if (hasPlanFeature(entitlements.tier, "tax_buffer_basic")) {
    providers.push({ source: "taxbuffer", load: () => loadTaxBufferProvider(userId, now) })
  }
  if (hasPlanFeature(entitlements.tier, "deposit_guard_access")) {
    providers.push({ source: "depositguard", load: () => loadDepositGuardOwnerDigestProvider(userId, now) })
  }
  if (hasPlanFeature(entitlements.tier, "commitguard_core")) {
    providers.push({ source: "commitguard", load: () => loadCommitGuardProvider(userId, now) })
  }
  if (hasPlanFeature(entitlements.tier, "marginguard_core")) {
    providers.push({ source: "marginguard", load: () => loadMarginGuardProvider(userId, now) })
  }
  if (hasPlanFeature(entitlements.tier, "runwayguard_core")) {
    providers.push({ source: "runwayguard", load: () => loadRunwayGuardProvider(userId, now) })
  }

  const results = await runOwnersDigestProviderRegistry(providers)
  return results.filter((provider, index, all) => all.findIndex((value) => value.source === provider.source) === index)
}

function snapshotFromRows(row: {
  id: string
  frequency: string
  periodLabel: string | null
  periodStart: Date
  periodEnd: Date
  status: string
  summary: string
  dataAsOf: Date | null
  generatedAt: Date
  lastRegeneratedAt: Date | null
  generationSource: string
  generationState: string
  completenessStatus: string
  completenessSummary: string | null
  statusReason: string | null
  items: Array<{
    id: string
    source: string
    signalType: string
    title: string
    summary: string
    severity: string
    priorityScore: number
    section: string
    sortOrder: number
    recommendedAction: string | null
    actionUrl: string | null
    whyItMatters: string | null
    financialImpactCents: number | null
    currentValue: number | null
    previousValue: number | null
    changeValue: number | null
    changePercent: number | null
    entityType: string | null
    entityId: string | null
    entityName: string | null
    contributingSources: unknown
    detectedAt: Date
    metadata: unknown
  }>
  metrics: Array<{
    metricKey: string
    label: string
    section: string | null
    unit: string
    displayValue: string
    numericValue: number | null
    monetaryValueCents: number | null
    previousNumericValue: number | null
    previousMonetaryValueCents: number | null
    changeNumericValue: number | null
    changeMonetaryValueCents: number | null
    changePercent: number | null
    sortOrder: number
    metadata: unknown
  }>
  providerRuns: Array<{
    source: string
    status: string
    signalCount: number
    surfacedCount: number
    stale: boolean
    entitled: boolean
    configured: boolean
    available: boolean
    dataAsOf: Date | null
    errorCode: string | null
    errorSummary: string | null
  }>
}): OwnersDigestSnapshotRecord {
  return {
    id: row.id,
    frequency: row.frequency as OwnersDigestFrequency,
    periodLabel: row.periodLabel ?? `${formatDayLabel(row.periodStart)} to ${formatDayLabel(row.periodEnd)}`,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status as OwnersDigestStatus,
    summary: row.summary,
    summaryMode: "deterministic",
    dataAsOf: row.dataAsOf,
    generatedAt: row.generatedAt,
    lastRegeneratedAt: row.lastRegeneratedAt,
    generationSource: row.generationSource,
    generationState: row.generationState,
    completenessStatus: row.completenessStatus as OwnersDigestSnapshotRecord["completenessStatus"],
    completenessSummary: row.completenessSummary,
    statusReason: row.statusReason,
    items: row.items.map((item) => ({
      id: item.id,
      source: item.source as OwnersDigestSource,
      signalType: item.signalType,
      title: item.title,
      summary: item.summary,
      severity: item.severity as OwnersDigestItem["severity"],
      priorityScore: item.priorityScore,
      section: item.section as OwnersDigestSection,
      recommendedAction: item.recommendedAction,
      actionUrl: item.actionUrl,
      whyItMatters: item.whyItMatters,
      financialImpactCents: item.financialImpactCents,
      currentValue: item.currentValue,
      previousValue: item.previousValue,
      changeValue: item.changeValue,
      changePercent: item.changePercent,
      entityType: item.entityType,
      entityId: item.entityId,
      entityName: item.entityName,
      detectedAt: item.detectedAt,
      contributingSources: Array.isArray(item.contributingSources)
        ? item.contributingSources as OwnersDigestSource[]
        : [item.source as OwnersDigestSource],
      metadata: (item.metadata as Record<string, unknown> | null | undefined) ?? undefined,
    })),
    metrics: row.metrics.map((metric) => ({
      key: metric.metricKey,
      label: metric.label,
      section: "key_numbers",
      unit: metric.unit as OwnersDigestMetric["unit"],
      displayValue: metric.displayValue,
      numericValue: metric.numericValue,
      monetaryValueCents: metric.monetaryValueCents,
      previousNumericValue: metric.previousNumericValue,
      previousMonetaryValueCents: metric.previousMonetaryValueCents,
      changeNumericValue: metric.changeNumericValue,
      changeMonetaryValueCents: metric.changeMonetaryValueCents,
      changePercent: metric.changePercent,
      sortOrder: metric.sortOrder,
      metadata: (metric.metadata as Record<string, unknown> | null | undefined) ?? undefined,
    })),
    providers: row.providerRuns.map((provider) => ({
      source: provider.source as OwnersDigestSource,
      status: provider.status as OwnersDigestProviderResult["status"],
      signals: [],
      metrics: [],
      dataAsOf: provider.dataAsOf,
      stale: provider.stale,
      entitled: provider.entitled,
      configured: provider.configured,
      available: provider.available,
      errorCode: provider.errorCode,
      errorSummary: provider.errorSummary,
    })),
  }
}

async function persistSnapshot(
  userId: string,
  input: Omit<OwnersDigestSnapshotRecord, "id"> & { generationSource: string },
): Promise<OwnersDigestSnapshotRecord> {
  return withUserContext(userId, async (tx) => {
    const snapshot = await tx.ownersDigestSnapshot.upsert({
      where: {
        userId_frequency_periodStart_periodEnd: {
          userId,
          frequency: input.frequency,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
      },
      create: {
        userId,
        frequency: input.frequency,
        periodLabel: input.periodLabel,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: input.status,
        summary: input.summary,
        summaryMode: input.summaryMode,
        dataAsOf: input.dataAsOf,
        generatedAt: input.generatedAt,
        lastRegeneratedAt: input.lastRegeneratedAt,
        generationSource: input.generationSource,
        generationState: input.generationState,
        providerSuccessCount: input.providers.filter((provider) => provider.status === "complete" || provider.status === "stale").length,
        providerFailureCount: input.providers.filter((provider) => provider.status === "partial" || provider.status === "unavailable").length,
        providerStaleCount: input.providers.filter((provider) => provider.stale).length,
        topAttentionCount: input.items.filter((item) => item.section === "needs_attention").length,
        opportunityCount: input.items.filter((item) => item.section === "opportunities").length,
        positiveCount: input.items.filter((item) => item.section === "positive_changes").length,
        infoCount: input.items.filter((item) => item.section === "info").length,
        completenessStatus: input.completenessStatus,
        completenessSummary: input.completenessSummary,
        statusReason: input.statusReason,
      },
      update: {
        status: input.status,
        summary: input.summary,
        summaryMode: input.summaryMode,
        dataAsOf: input.dataAsOf,
        generatedAt: input.generatedAt,
        lastRegeneratedAt: input.lastRegeneratedAt,
        generationSource: input.generationSource,
        generationState: input.generationState,
        providerSuccessCount: input.providers.filter((provider) => provider.status === "complete" || provider.status === "stale").length,
        providerFailureCount: input.providers.filter((provider) => provider.status === "partial" || provider.status === "unavailable").length,
        providerStaleCount: input.providers.filter((provider) => provider.stale).length,
        topAttentionCount: input.items.filter((item) => item.section === "needs_attention").length,
        opportunityCount: input.items.filter((item) => item.section === "opportunities").length,
        positiveCount: input.items.filter((item) => item.section === "positive_changes").length,
        infoCount: input.items.filter((item) => item.section === "info").length,
        completenessStatus: input.completenessStatus,
        completenessSummary: input.completenessSummary,
        statusReason: input.statusReason,
      },
      select: { id: true },
    })

    await Promise.all([
      tx.ownersDigestItem.deleteMany({ where: { snapshotId: snapshot.id } }),
      tx.ownersDigestMetric.deleteMany({ where: { snapshotId: snapshot.id } }),
      tx.ownersDigestProviderRun.deleteMany({ where: { snapshotId: snapshot.id } }),
    ])

    if (input.items.length > 0) {
      await tx.ownersDigestItem.createMany({
        data: input.items.map((item, index) => ({
          userId,
          snapshotId: snapshot.id,
          source: item.source,
          signalType: item.signalType,
          severity: item.severity,
          priorityScore: item.priorityScore,
          section: item.section,
          sortOrder: index + 1,
          title: item.title,
          summary: item.summary,
          whyItMatters: item.whyItMatters ?? null,
          financialImpactCents: item.financialImpactCents ?? null,
          currentValue: item.currentValue ?? null,
          previousValue: item.previousValue ?? null,
          changeValue: item.changeValue ?? null,
          changePercent: item.changePercent ?? null,
          entityType: item.entityType ?? null,
          entityId: item.entityId ?? null,
          entityName: item.entityName ?? null,
          recommendedAction: item.recommendedAction ?? null,
          actionUrl: item.actionUrl ?? null,
          contributingSources: item.contributingSources,
          metadata: (item.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          detectedAt: item.detectedAt,
        })),
      })
    }

    if (input.metrics.length > 0) {
      await tx.ownersDigestMetric.createMany({
        data: input.metrics.map((metric) => ({
          userId,
          snapshotId: snapshot.id,
          metricKey: metric.key,
          label: metric.label,
          section: "key_numbers",
          unit: metric.unit,
          displayValue: metric.displayValue,
          numericValue: metric.numericValue ?? null,
          monetaryValueCents: metric.monetaryValueCents ?? null,
          previousNumericValue: metric.previousNumericValue ?? null,
          previousMonetaryValueCents: metric.previousMonetaryValueCents ?? null,
          changeNumericValue: metric.changeNumericValue ?? null,
          changeMonetaryValueCents: metric.changeMonetaryValueCents ?? null,
          changePercent: metric.changePercent ?? null,
          sortOrder: metric.sortOrder,
          metadata: (metric.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        })),
      })
    }

    if (input.providers.length > 0) {
      await tx.ownersDigestProviderRun.createMany({
        data: input.providers.map((provider) => ({
          userId,
          snapshotId: snapshot.id,
          source: provider.source,
          status: provider.status,
          signalCount: provider.signals.length,
          surfacedCount: input.items.filter((item) => item.contributingSources.includes(provider.source)).length,
          stale: provider.stale,
          entitled: provider.entitled,
          configured: provider.configured,
          available: provider.available,
          dataAsOf: provider.dataAsOf,
          errorCode: provider.errorCode ?? null,
          errorSummary: provider.errorSummary ?? null,
        })),
      })
    }

    const hydrated = await tx.ownersDigestSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
      include: {
        items: { orderBy: [{ priorityScore: "desc" }, { sortOrder: "asc" }] },
        metrics: { orderBy: { sortOrder: "asc" } },
        providerRuns: { orderBy: { source: "asc" } },
      },
    })

    return snapshotFromRows(hydrated)
  })
}

export async function generateOwnersDigest(
  userId: string,
  options?: { now?: Date; source?: "scheduled" | "manual" | "page_load" },
): Promise<OwnersDigestGenerationResult> {
  await requireOwnersDigestCoreAccess(userId)
  const now = options?.now ?? new Date()
  const settings = await getOrCreateOwnersDigestSettings(userId)
  const { frequency, periodLabel, periodStart, periodEnd } = getOwnersDigestPeriodBounds(settings.frequency, now)

  console.info(
    JSON.stringify({
      event: "owners_digest_generation_started",
      userId,
      source: options?.source ?? "page_load",
      frequency,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    }),
  )

  const providerResults = await collectProviderResults(userId, now)
  console.info(
    JSON.stringify({
      event: "owners_digest_provider_results",
      userId,
      providerCount: providerResults.length,
      providers: providerResults.map((provider) => ({
        source: provider.source,
        status: provider.status,
        signalCount: provider.signals.length,
        stale: provider.stale,
      })),
    }),
  )
  const surfacedSignals = dedupeOwnersDigestSignals(
    providerResults.flatMap((provider) => provider.signals).filter((signal) => shouldSurfaceOwnersDigestSignal(signal, settings)),
  )
  const limitedAttention = surfacedSignals.filter((item) => item.section !== "needs_attention")
  const attention = surfacedSignals
    .filter((item) => item.section === "needs_attention")
    .slice(0, settings.maxActionItems)
  const items = [...attention, ...limitedAttention].sort(compareSignals)
  const metrics = providerResults
    .flatMap((provider) => provider.metrics)
    .filter((metric, index, all) => all.findIndex((candidate) => candidate.key === metric.key) === index)
    .sort((left, right) => left.sortOrder - right.sortOrder)
  const status = determineOwnersDigestStatus(items)
  const snapshot = await persistSnapshot(userId, {
    frequency,
    periodLabel,
    periodStart,
    periodEnd,
    status,
    summary: buildOwnersDigestSummary(status, items),
    summaryMode: "deterministic",
    dataAsOf: latestDataAsOf(providerResults),
    generatedAt: now,
    lastRegeneratedAt: now,
    generationSource: options?.source ?? "page_load",
    generationState: "complete",
    completenessStatus: completenessStatus(providerResults),
    completenessSummary: buildCompletenessSummary(providerResults),
    statusReason: buildStatusReason(status, items),
    items,
    metrics,
    providers: providerResults,
  })

  console.info(
    JSON.stringify({
      event: "owners_digest_generated",
      userId,
      digestId: snapshot.id,
      status: snapshot.status,
      completenessStatus: snapshot.completenessStatus,
      itemCount: snapshot.items.length,
      metricCount: snapshot.metrics.length,
    }),
  )

  return { ...snapshot, created: true }
}

export async function getCurrentOwnersDigest(userId: string): Promise<OwnersDigestSnapshotRecord> {
  await requireOwnersDigestCoreAccess(userId)
  const settings = await getOrCreateOwnersDigestSettings(userId)
  const { frequency, periodStart, periodEnd } = getOwnersDigestPeriodBounds(settings.frequency)
  const existing = await withUserContext(userId, (tx) =>
    tx.ownersDigestSnapshot.findUnique({
      where: {
        userId_frequency_periodStart_periodEnd: {
          userId,
          frequency,
          periodStart,
          periodEnd,
        },
      },
      include: {
        items: { orderBy: [{ priorityScore: "desc" }, { sortOrder: "asc" }] },
        metrics: { orderBy: { sortOrder: "asc" } },
        providerRuns: { orderBy: { source: "asc" } },
      },
    }),
  )

  if (existing) {
    return snapshotFromRows(existing)
  }

  return generateOwnersDigest(userId, { source: "page_load" })
}

export async function regenerateCurrentOwnersDigest(userId: string): Promise<OwnersDigestSnapshotRecord> {
  await requireOwnersDigestCoreAccess(userId)
  return generateOwnersDigest(userId, { source: "manual" })
}

export async function getOwnersDigestById(userId: string, digestId: string): Promise<OwnersDigestSnapshotRecord | null> {
  await requireOwnersDigestCoreAccess(userId)
  const row = await withUserContext(userId, (tx) =>
    tx.ownersDigestSnapshot.findFirst({
      where: { id: digestId, userId },
      include: {
        items: { orderBy: [{ priorityScore: "desc" }, { sortOrder: "asc" }] },
        metrics: { orderBy: { sortOrder: "asc" } },
        providerRuns: { orderBy: { source: "asc" } },
      },
    }),
  )
  return row ? snapshotFromRows(row) : null
}

export async function listOwnersDigestHistory(
  userId: string,
  limit: number = 12,
): Promise<OwnersDigestHistoryEntry[]> {
  await requireOwnersDigestHistoryAccess(userId)
  const rows = await withUserContext(userId, (tx) =>
    tx.ownersDigestSnapshot.findMany({
      where: { userId },
      orderBy: [{ periodStart: "desc" }, { generatedAt: "desc" }],
      take: Math.max(1, Math.min(limit, 52)),
      select: {
        id: true,
        status: true,
        frequency: true,
        periodLabel: true,
        periodStart: true,
        periodEnd: true,
        generatedAt: true,
        summary: true,
        topAttentionCount: true,
      },
    }),
  )

  return rows.map((row) => ({
    id: row.id,
    status: row.status as OwnersDigestStatus,
    frequency: row.frequency as OwnersDigestFrequency,
    periodLabel: row.periodLabel ?? `${formatDayLabel(row.periodStart)} to ${formatDayLabel(row.periodEnd)}`,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    generatedAt: row.generatedAt.toISOString(),
    summary: row.summary,
    topAttentionCount: row.topAttentionCount,
  }))
}

export async function loadOwnersDigestSettings(userId: string): Promise<OwnersDigestSettingsSnapshot> {
  await requireOwnersDigestCoreAccess(userId)
  return getOrCreateOwnersDigestSettings(userId)
}

export async function updateOwnersDigestSettings(
  userId: string,
  input: SaveOwnersDigestSettingsInput,
): Promise<OwnersDigestSettingsSnapshot> {
  await requireOwnersDigestCoreAccess(userId)
  return saveOwnersDigestSettings(userId, input)
}

export function buildOwnersDigestFeatureSummary(): OwnersDigestSettingsSnapshot {
  return OWNERS_DIGEST_DEFAULT_SETTINGS
}
