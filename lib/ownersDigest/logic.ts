import type {
  OwnersDigestFrequency,
  OwnersDigestItem,
  OwnersDigestSection,
  OwnersDigestSettingsSnapshot,
  OwnersDigestSignal,
  OwnersDigestStatus,
} from "@/lib/ownersDigest/types"

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
    return { frequency: safeFrequency, periodLabel: formatDayLabel(periodStart), periodStart, periodEnd }
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

function sectionForSeverity(severity: OwnersDigestSignal["severity"]): OwnersDigestSection {
  if (severity === "critical" || severity === "warning") return "needs_attention"
  if (severity === "opportunity") return "opportunities"
  if (severity === "positive") return "positive_changes"
  return "info"
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
      winner.financialImpactCents = Math.max(existing.financialImpactCents ?? 0, next.financialImpactCents ?? 0)
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
