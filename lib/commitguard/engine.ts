import {
  normalizeCommitmentConfidence,
  normalizeCommitmentFrequency,
  normalizeCommitmentStatus,
  type CommitmentConfidence,
  type CommitmentFrequency,
  type CommitmentSnapshot,
  type CommitGuardSettingsSnapshot,
  type FreeCashStatus,
  type RenewalSeverity,
} from "@/lib/commitguard/types"

export interface CommitmentOccurrence {
  commitmentId: string
  name: string
  amountCents: number
  dueDate: Date
  confidence: CommitmentConfidence
}

export interface CommitmentHorizonTotals {
  days: 7 | 30 | 60 | 90
  totalCents: number
  confirmedCents: number
  probableCents: number
  potentialCents: number
}

export interface FreeCashBreakdown {
  cashAvailableCents: number | null
  committedCashCents: number
  taxProtectedCashCents: number
  safetyBufferCents: number
  protectedCashCents: number
  freeCashCents: number | null
  status: FreeCashStatus
}

export interface RenewalAssessment {
  commitmentId: string
  name: string
  renewalDate: Date
  noticePeriodDays: number
  noticeCloseDate: Date
  daysToNoticeClose: number
  severity: RenewalSeverity
}

const ACTIVE_FORECAST_STATUSES = new Set(["active", "upcoming", "ending", "review"])

function startOfDayUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function addMonthsClamped(value: Date, months: number): Date {
  const year = value.getUTCFullYear()
  const month = value.getUTCMonth()
  const day = value.getUTCDate()
  const hour = value.getUTCHours()
  const minute = value.getUTCMinutes()
  const second = value.getUTCSeconds()
  const ms = value.getUTCMilliseconds()

  const targetMonth = month + months
  const monthStart = new Date(Date.UTC(year, targetMonth, 1, hour, minute, second, ms))
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, hour, minute, second, ms))
  const clampedDay = Math.min(day, monthEnd.getUTCDate())

  return new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), clampedDay, hour, minute, second, ms),
  )
}

function nextOccurrence(value: Date, frequency: CommitmentFrequency): Date {
  switch (frequency) {
    case "weekly":
      return addDays(value, 7)
    case "fortnightly":
      return addDays(value, 14)
    case "monthly":
      return addMonthsClamped(value, 1)
    case "quarterly":
      return addMonthsClamped(value, 3)
    case "six_monthly":
      return addMonthsClamped(value, 6)
    case "annual":
      return addMonthsClamped(value, 12)
    case "one_off":
    case "custom":
    default:
      return value
  }
}

function shouldIncludeInForecast(commitment: CommitmentSnapshot): boolean {
  const status = normalizeCommitmentStatus(commitment.status)
  return ACTIVE_FORECAST_STATUSES.has(status)
}

export function projectCommitmentOccurrences(input: {
  commitment: CommitmentSnapshot
  windowStart: Date
  windowEnd: Date
  maxOccurrences?: number
}): CommitmentOccurrence[] {
  const { commitment } = input
  const windowStart = startOfDayUtc(input.windowStart)
  const windowEnd = startOfDayUtc(input.windowEnd)
  const maxOccurrences = Math.max(1, input.maxOccurrences ?? 250)

  if (!shouldIncludeInForecast(commitment) || !commitment.nextDueDate) {
    return []
  }

  const frequency = normalizeCommitmentFrequency(commitment.frequency)
  const confidence = normalizeCommitmentConfidence(commitment.confidence)
  const endDate = commitment.endDate ? startOfDayUtc(commitment.endDate) : null
  let dueDate = startOfDayUtc(commitment.nextDueDate)

  const results: CommitmentOccurrence[] = []

  for (let index = 0; index < maxOccurrences; index += 1) {
    if (dueDate > windowEnd) break
    if (endDate && dueDate > endDate) break

    if (dueDate >= windowStart) {
      results.push({
        commitmentId: commitment.id,
        name: commitment.name,
        amountCents: commitment.amountCents,
        dueDate,
        confidence,
      })
    }

    if (frequency === "one_off" || frequency === "custom") {
      break
    }

    const next = nextOccurrence(dueDate, frequency)
    if (next.getTime() <= dueDate.getTime()) break
    dueDate = next
  }

  return results
}

export function buildCommitmentHorizonTotals(input: {
  commitments: CommitmentSnapshot[]
  now?: Date
  horizons?: Array<7 | 30 | 60 | 90>
}): CommitmentHorizonTotals[] {
  const now = startOfDayUtc(input.now ?? new Date())
  const horizons = input.horizons ?? [7, 30, 60, 90]

  return horizons.map((days) => {
    const windowEnd = addDays(now, days)
    let totalCents = 0
    let confirmedCents = 0
    let probableCents = 0
    let potentialCents = 0

    for (const commitment of input.commitments) {
      const occurrences = projectCommitmentOccurrences({
        commitment,
        windowStart: now,
        windowEnd,
      })

      for (const occurrence of occurrences) {
        totalCents += occurrence.amountCents

        if (occurrence.confidence === "confirmed") {
          confirmedCents += occurrence.amountCents
        } else if (occurrence.confidence === "high" || occurrence.confidence === "medium") {
          probableCents += occurrence.amountCents
        } else {
          potentialCents += occurrence.amountCents
        }
      }
    }

    return {
      days,
      totalCents,
      confirmedCents,
      probableCents,
      potentialCents,
    }
  })
}

export function resolveSafetyBufferCents(input: {
  settings: CommitGuardSettingsSnapshot
  monthlyCommitmentsCents: number
  weeklyOperatingExpensesCents: number
}): number {
  const fixed = Math.max(0, Math.round(input.settings.safetyBufferFixedCents))
  if (input.settings.safetyBufferMode === "fixed_amount") return fixed

  if (input.settings.safetyBufferMode === "percentage_monthly_commitments") {
    const percent = Math.max(0, input.settings.safetyBufferPercent ?? 0)
    return Math.max(0, Math.round((input.monthlyCommitmentsCents * percent) / 100))
  }

  const weeks = Math.max(0, input.settings.safetyBufferWeeks ?? 0)
  return Math.max(0, Math.round(input.weeklyOperatingExpensesCents * weeks))
}

export function calculateFreeCashBreakdown(input: {
  cashAvailableCents: number | null
  committedCashCents: number
  taxProtectedCashCents: number
  safetyBufferCents: number
}): FreeCashBreakdown {
  const committedCashCents = Math.max(0, input.committedCashCents)
  const taxProtectedCashCents = Math.max(0, input.taxProtectedCashCents)
  const safetyBufferCents = Math.max(0, input.safetyBufferCents)
  const protectedCashCents = committedCashCents + taxProtectedCashCents + safetyBufferCents

  if (input.cashAvailableCents === null) {
    return {
      cashAvailableCents: null,
      committedCashCents,
      taxProtectedCashCents,
      safetyBufferCents,
      protectedCashCents,
      freeCashCents: null,
      status: "watch",
    }
  }

  const freeCashCents = input.cashAvailableCents - protectedCashCents
  const watchThreshold = safetyBufferCents
  const atRiskThreshold = Math.max(0, Math.round(safetyBufferCents * 0.25))

  let status: FreeCashStatus = "safe"
  if (freeCashCents < 0) {
    status = "shortfall"
  } else if (freeCashCents <= atRiskThreshold) {
    status = "at_risk"
  } else if (freeCashCents <= watchThreshold) {
    status = "watch"
  }

  return {
    cashAvailableCents: input.cashAvailableCents,
    committedCashCents,
    taxProtectedCashCents,
    safetyBufferCents,
    protectedCashCents,
    freeCashCents,
    status,
  }
}

export function assessRenewalSeverity(input: {
  renewalDate: Date
  noticePeriodDays: number
  now?: Date
  warningDays?: number[]
}): RenewalSeverity {
  const now = startOfDayUtc(input.now ?? new Date())
  const renewalDate = startOfDayUtc(input.renewalDate)
  const noticePeriodDays = Math.max(0, input.noticePeriodDays)
  const noticeCloseDate = addDays(renewalDate, -noticePeriodDays)
  const msPerDay = 24 * 60 * 60 * 1000
  const daysToNoticeClose = Math.floor((noticeCloseDate.getTime() - now.getTime()) / msPerDay)

  const sortedWarnings = [...(input.warningDays ?? [90, 60, 30, 14, 7])]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)

  const urgentThreshold = sortedWarnings[0] ?? 7
  const actionThreshold = sortedWarnings.find((value) => value > urgentThreshold) ?? 14
  const watchThreshold = sortedWarnings.find((value) => value > actionThreshold) ?? 30

  if (daysToNoticeClose <= urgentThreshold) return "urgent"
  if (daysToNoticeClose <= actionThreshold) return "action_required"
  if (daysToNoticeClose <= watchThreshold) return "watch"
  return "info"
}

export function buildRenewalAssessments(input: {
  commitments: CommitmentSnapshot[]
  now?: Date
  warningDays?: number[]
}): RenewalAssessment[] {
  const now = startOfDayUtc(input.now ?? new Date())
  const msPerDay = 24 * 60 * 60 * 1000

  return input.commitments
    .filter((commitment) => commitment.renewalDate && shouldIncludeInForecast(commitment))
    .map((commitment) => {
      const renewalDate = startOfDayUtc(commitment.renewalDate as Date)
      const noticePeriodDays = Math.max(0, commitment.noticePeriodDays ?? 0)
      const noticeCloseDate = addDays(renewalDate, -noticePeriodDays)
      const daysToNoticeClose = Math.floor((noticeCloseDate.getTime() - now.getTime()) / msPerDay)

      return {
        commitmentId: commitment.id,
        name: commitment.name,
        renewalDate,
        noticePeriodDays,
        noticeCloseDate,
        daysToNoticeClose,
        severity: assessRenewalSeverity({
          renewalDate,
          noticePeriodDays,
          now,
          warningDays: input.warningDays,
        }),
      }
    })
    .sort((left, right) => left.noticeCloseDate.getTime() - right.noticeCloseDate.getTime())
}
