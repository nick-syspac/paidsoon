import {
  COMMITMENT_PROTECTION_CONFIDENCE_CLASSES,
  commitmentConfidenceClass,
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
import { CommitGuardCurrencySchema } from "@/lib/commitguard/cashContext"
import { classifyCommitGuardFreeCash, resolveCommitGuardSafetyBuffer } from "@/lib/commitguard/protectionComposition"

export interface CommitmentOccurrence {
  commitmentId: string
  name: string
  amountCents: number
  currency: string
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

export interface CommitmentCurrencyHorizons {
  currency: string
  supportedForFreeCash: boolean
  horizons: Array<CommitmentHorizonTotals & { occurrenceCount: number }>
}

export interface CommitmentProtectionProjection {
  selectedHorizonDays: CommitmentHorizonTotals["days"]
  cashCurrency: string | null
  horizonsByCurrency: CommitmentCurrencyHorizons[]
  // Compatible component only, never a consolidated mixed-currency amount.
  selectedCurrencyTotals: CommitmentHorizonTotals | null
  monthlyCommitmentsCents: number | null
  excludedCurrencies: string[]
  unavailableReason: "cash_currency_missing" | "unsupported_currency" | "currency_mismatch" | null
  includedConfidenceClasses: typeof COMMITMENT_PROTECTION_CONFIDENCE_CLASSES
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

export type CommitmentProjectionErrorCode =
  | "invalid_window"
  | "invalid_date"
  | "invalid_boundaries"
  | "invalid_occurrence_limit"
  | "missing_next_due_date"
  | "unsupported_recurrence"
  | "occurrence_limit_exceeded"
  | "currency_context_required"
  | "unsupported_currency"
  | "mixed_currencies"
  | "invalid_amount"
  | "amount_overflow"
  | "buffer_inputs_unavailable"

// Keep array/totals consumers compatible, but never return a partial financial total.
// Summary v2 can translate these codes into its incomplete-quality reasons.
export class CommitmentProjectionError extends Error {
  constructor(public readonly code: CommitmentProjectionErrorCode) {
    super(`Commitment projection incomplete: ${code}`)
    this.name = "CommitmentProjectionError"
  }
}

function startOfDayUtc(value: Date): Date {
  const result = new Date(value)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function projectionDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new CommitmentProjectionError("invalid_date")
  }
  return startOfDayUtc(value)
}

function monthNumber(value: Date): number {
  return value.getUTCFullYear() * 12 + value.getUTCMonth()
}

function anchoredMonthParts(anchor: Date, months: number): [number, number, number] {
  const target = monthNumber(anchor) + months
  const year = Math.floor(target / 12)
  const month = target - year * 12
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = month === 1 ? (leap ? 29 : 28) : [3, 5, 8, 10].includes(month) ? 30 : 31
  return [year, month, Math.min(anchor.getUTCDate(), days)]
}

function monthStep(frequency: CommitmentFrequency): number {
  return frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "six_monthly" ? 6 : 12
}

// An occurrence index is always relative to nextDueDate, never to a clamped
// predecessor or startDate. Finding either bound is O(1), even centuries later.
function occurrenceIndex(anchor: Date, bound: Date, frequency: CommitmentFrequency, strict = false): number {
  if (frequency === "weekly" || frequency === "fortnightly") {
    const period = (frequency === "weekly" ? 7 : 14) * 86_400_000
    const distance = (bound.getTime() - anchor.getTime()) / period
    return Math.max(0, strict ? Math.floor(distance) + 1 : Math.ceil(distance))
  }

  const step = monthStep(frequency)
  const index = Math.max(0, Math.floor((monthNumber(bound) - monthNumber(anchor)) / step))
  const [year, month, day] = anchoredMonthParts(anchor, index * step)
  const monthDifference = year * 12 + month - monthNumber(bound)
  const before = monthDifference < 0 || (monthDifference === 0 && (strict ? day <= bound.getUTCDate() : day < bound.getUTCDate()))
  return index + (before ? 1 : 0)
}

function occurrenceAt(anchor: Date, index: number, frequency: CommitmentFrequency): Date {
  if (frequency === "weekly" || frequency === "fortnightly") {
    return addDays(anchor, index * (frequency === "weekly" ? 7 : 14))
  }
  const [year, month, day] = anchoredMonthParts(anchor, index * monthStep(frequency))
  const result = new Date(0)
  result.setUTCFullYear(year, month, day)
  return result
}

/** Same original-anchor skip-ahead math as forecast projection, without a horizon. */
export function nextCommitmentOccurrence(anchor: Date, frequency: CommitmentFrequency, onOrAfter: Date): Date {
  if (frequency === "custom" || frequency === "one_off") {
    throw new CommitmentProjectionError("unsupported_recurrence")
  }
  const original = projectionDate(anchor)
  return occurrenceAt(original, occurrenceIndex(original, projectionDate(onOrAfter), frequency), frequency)
}

export type CommitmentScheduleSnapshot = Pick<CommitmentSnapshot,
  "id" | "name" | "amountCents" | "currency" | "frequency" | "confidence" |
  "status" | "archivedAt" | "nextDueDate" | "startDate" | "endDate">

function shouldIncludeInForecast(commitment: CommitmentScheduleSnapshot): boolean {
  const status = normalizeCommitmentStatus(commitment.status)
  return !commitment.archivedAt && commitment.status.trim().toLowerCase() !== "archived" && ACTIVE_FORECAST_STATUSES.has(status)
}

export function projectCommitmentOccurrences(input: {
  commitment: CommitmentScheduleSnapshot
  windowStart: Date
  windowEnd: Date
  maxOccurrences?: number
}): CommitmentOccurrence[] {
  const { commitment } = input
  const windowStart = projectionDate(input.windowStart)
  const windowEnd = projectionDate(input.windowEnd)
  const maxOccurrences = input.maxOccurrences ?? 250
  if (windowEnd < windowStart) throw new CommitmentProjectionError("invalid_window")
  if (!Number.isSafeInteger(maxOccurrences) || maxOccurrences < 1) {
    throw new CommitmentProjectionError("invalid_occurrence_limit")
  }

  if (!shouldIncludeInForecast(commitment) || windowStart.getTime() === windowEnd.getTime()) return []

  const frequency = normalizeCommitmentFrequency(commitment.frequency)
  const confidence = normalizeCommitmentConfidence(commitment.confidence)
  const startDate = commitment.startDate ? projectionDate(commitment.startDate) : null
  const endDate = commitment.endDate ? projectionDate(commitment.endDate) : null
  if (startDate && endDate && startDate > endDate) {
    throw new CommitmentProjectionError("invalid_boundaries")
  }
  if ((startDate && startDate >= windowEnd) || (endDate && endDate < windowStart)) return []
  if (frequency === "custom") throw new CommitmentProjectionError("unsupported_recurrence")
  if (!commitment.nextDueDate) throw new CommitmentProjectionError("missing_next_due_date")
  const anchor = projectionDate(commitment.nextDueDate)
  const lower = startDate && startDate > windowStart ? startDate : windowStart
  const occurrence = (dueDate: Date): CommitmentOccurrence => ({
    commitmentId: commitment.id,
    name: commitment.name,
    amountCents: commitment.amountCents,
    currency: commitment.currency.trim().toLowerCase(),
    dueDate,
    confidence,
  })

  if (frequency === "one_off") {
    return anchor >= lower && anchor < windowEnd && (!endDate || anchor <= endDate) ? [occurrence(anchor)] : []
  }

  const first = occurrenceIndex(anchor, lower, frequency)
  const exclusiveEnd = Math.min(
    occurrenceIndex(anchor, windowEnd, frequency),
    endDate ? occurrenceIndex(anchor, endDate, frequency, true) : Infinity,
  )
  const count = Math.max(0, exclusiveEnd - first)
  // Preflight before allocation: only emitted in-window rows consume the existing
  // configurable budget. Even huge valid windows fail without traversing them.
  if (count > maxOccurrences) throw new CommitmentProjectionError("occurrence_limit_exceeded")
  const results: CommitmentOccurrence[] = []
  for (let index = first; index < exclusiveEnd; index += 1) {
    results.push(occurrence(occurrenceAt(anchor, index, frequency)))
  }
  return results
}

export function buildCommitmentHorizonTotals(input: {
  commitments: CommitmentSnapshot[]
  now?: Date
  horizons?: Array<7 | 30 | 60 | 90>
}): CommitmentHorizonTotals[] {
  const groups = buildCommitmentHorizonsByCurrency(input)
  // Legacy callers cannot represent exclusions. Never hand them an arbitrary
  // currency group or a mixed total. Summary v2 will map this to unavailable.
  if (groups.length > 1) throw new CommitmentProjectionError("mixed_currencies")
  if (groups[0] && !groups[0].supportedForFreeCash) {
    throw new CommitmentProjectionError("unsupported_currency")
  }
  return (input.horizons ?? [7, 30, 60, 90]).map((days) => {
    const row = groups[0]?.horizons.find((horizon) => horizon.days === days)
    return { days, totalCents: row?.totalCents ?? 0, confirmedCents: row?.confirmedCents ?? 0,
      probableCents: row?.probableCents ?? 0, potentialCents: row?.potentialCents ?? 0 }
  })
}

function addCents(left: number, right: number): number {
  if (!Number.isInteger(right) || right < 0) throw new CommitmentProjectionError("invalid_amount")
  const total = left + right
  if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
    throw new CommitmentProjectionError("amount_overflow")
  }
  return total
}

export function buildCommitmentHorizonsByCurrency(input: {
  commitments: CommitmentSnapshot[]
  now?: Date
  horizons?: Array<7 | 30 | 60 | 90>
}): CommitmentCurrencyHorizons[] {
  const now = projectionDate(input.now ?? new Date())
  const horizons = [...new Set<CommitmentHorizonTotals["days"]>(input.horizons ?? [7, 30, 60, 90])]
  for (const days of horizons) {
    if (![7, 30, 60, 90].includes(days)) throw new CommitmentProjectionError("invalid_window")
  }
  const groups = new Map<string, CommitmentCurrencyHorizons>()
  for (const commitment of input.commitments) {
    for (const days of horizons) {
      const occurrences = projectCommitmentOccurrences({
        commitment,
        windowStart: now,
        windowEnd: projectionDate(addDays(now, days)),
      })
      for (const occurrence of occurrences) {
        let group = groups.get(occurrence.currency)
        if (!group) {
          group = {
            currency: occurrence.currency,
            supportedForFreeCash: CommitGuardCurrencySchema.safeParse(occurrence.currency).success,
            horizons: horizons.map((days) => ({ days, totalCents: 0, confirmedCents: 0,
              probableCents: 0, potentialCents: 0, occurrenceCount: 0 })),
          }
          groups.set(occurrence.currency, group)
        }
        const total = group.horizons.find((horizon) => horizon.days === days)!
        total.totalCents = addCents(total.totalCents, occurrence.amountCents)
        const partition = `${commitmentConfidenceClass(occurrence.confidence)}Cents` as const
        total[partition] = addCents(total[partition], occurrence.amountCents)
        total.occurrenceCount += 1
      }
    }
  }
  return [...groups.values()].sort((left, right) => left.currency.localeCompare(right.currency))
}

export function buildCommitmentProtection(input: {
  commitments: CommitmentSnapshot[]
  selectedHorizonDays: number
  cashCurrency: string | null
  now?: Date
}): CommitmentProtectionProjection {
  if (![7, 30, 60, 90].includes(input.selectedHorizonDays)) {
    throw new CommitmentProjectionError("invalid_window")
  }
  const selectedHorizonDays = input.selectedHorizonDays as CommitmentHorizonTotals["days"]
  const cashCurrency = input.cashCurrency?.trim().toLowerCase() || null
  const horizonsByCurrency = buildCommitmentHorizonsByCurrency(input)
  const supported = CommitGuardCurrencySchema.safeParse(cashCurrency).success
  const selected = horizonsByCurrency.find((group) => group.currency === cashCurrency)
  const selectedHorizon = selected?.horizons.find((row) => row.days === selectedHorizonDays)
  const selectedCurrencyTotals = supported ? {
    days: selectedHorizonDays,
    totalCents: selectedHorizon?.totalCents ?? 0,
    confirmedCents: selectedHorizon?.confirmedCents ?? 0,
    probableCents: selectedHorizon?.probableCents ?? 0,
    potentialCents: selectedHorizon?.potentialCents ?? 0,
  } : null
  const excludedCurrencies = horizonsByCurrency.filter((group) => group.currency !== cashCurrency &&
    group.horizons.some((row) => row.days === selectedHorizonDays && row.occurrenceCount > 0))
    .map((group) => group.currency)
  return {
    selectedHorizonDays, cashCurrency, horizonsByCurrency, selectedCurrencyTotals,
    monthlyCommitmentsCents: supported ? selected?.horizons.find((row) => row.days === 30)?.totalCents ?? 0 : null,
    excludedCurrencies,
    unavailableReason: cashCurrency === null ? "cash_currency_missing" : !supported ? "unsupported_currency"
      : excludedCurrencies.length > 0 ? "currency_mismatch" : null,
    includedConfidenceClasses: COMMITMENT_PROTECTION_CONFIDENCE_CLASSES,
  }
}

export function resolveSafetyBufferCents(input: {
  settings: CommitGuardSettingsSnapshot
  monthlyCommitmentsCents: number | null
  weeklyOperatingExpensesCents?: number | null
  cashCurrency?: string | null
  weeklyExpensesCurrency?: string | null
  weeklyExpensesAsOf?: string | null
  now?: Date
}): number {
  const result = resolveCommitGuardSafetyBuffer({
    settings: input.settings, monthlyCommitmentsCents: input.monthlyCommitmentsCents,
    cashContext: { currency: input.cashCurrency ?? null,
      weeklyOperatingExpensesCents: input.weeklyOperatingExpensesCents ?? null,
      weeklyExpensesCurrency: input.weeklyExpensesCurrency ?? null,
      weeklyExpensesAsOf: input.weeklyExpensesAsOf ?? null }, now: input.now ?? new Date(),
  })
  if (result.amountCents === null) {
    throw new CommitmentProjectionError(result.quality.reasons.includes("amount_overflow")
      ? "amount_overflow" : "buffer_inputs_unavailable")
  }
  return result.amountCents
}

export function calculateFreeCashBreakdown(input: {
  cashAvailableCents: number | null
  committedCashCents: number
  taxProtectedCashCents: number
  safetyBufferCents: number
}): FreeCashBreakdown {
  const committedCashCents = addCents(0, input.committedCashCents)
  const taxProtectedCashCents = addCents(0, input.taxProtectedCashCents)
  const safetyBufferCents = addCents(0, input.safetyBufferCents)
  const protectedCashCents = addCents(addCents(committedCashCents, taxProtectedCashCents), safetyBufferCents)

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
  if (!Number.isInteger(input.cashAvailableCents)) throw new CommitmentProjectionError("invalid_amount")
  if (input.cashAvailableCents < -2_147_483_648 || input.cashAvailableCents > 2_147_483_647 ||
    !Number.isSafeInteger(freeCashCents) || freeCashCents < -2_147_483_648) {
    throw new CommitmentProjectionError("amount_overflow")
  }
  const status = classifyCommitGuardFreeCash(freeCashCents, safetyBufferCents)

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

  const sortedWarnings = normalizeRenewalWarningDays(input.warningDays ?? [90, 60, 30, 14, 7])
  if (sortedWarnings[0] !== undefined && daysToNoticeClose <= sortedWarnings[0]) return "urgent"
  if (sortedWarnings[1] !== undefined && daysToNoticeClose <= sortedWarnings[1]) return "action_required"
  if (sortedWarnings.length > 2 && daysToNoticeClose <= sortedWarnings[sortedWarnings.length - 1]) return "watch"
  return "info"
}

export function normalizeRenewalWarningDays(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0))]
    .sort((a, b) => a - b)
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
