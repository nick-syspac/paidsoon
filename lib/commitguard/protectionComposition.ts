import { CommitGuardCurrencySchema, getCommitGuardInputFreshness } from "@/lib/commitguard/cashContext"
import { getCommitGuardBufferPolicyReasons, type CommitGuardBufferPolicyReason } from "@/lib/commitguard/bufferPolicyQuality"
import type { CommitmentProtectionProjection, CommitmentProjectionErrorCode } from "@/lib/commitguard/engine"
import type { CommitGuardSettingsSnapshot, FreeCashStatus } from "@/lib/commitguard/types"
import type { CoverageReason } from "@/lib/commitguard/coverage"
import type { CommitGuardTaxProtectionReason } from "@/lib/commitguard/protectionFacts"

const INT_MAX = 2_147_483_647
const INT_MIN = -2_147_483_648

export type CommitGuardProtectionReason = CommitGuardBufferPolicyReason
  | CoverageReason | Exclude<CommitGuardTaxProtectionReason, "not_applicable">
  | CommitmentProjectionErrorCode
  | "cash_currency_missing" | "currency_mismatch"
  | "module_disabled" | "cash_missing" | "cash_stale" | "cash_date_invalid" | "cash_amount_invalid"
  | "fixed_buffer_amount_invalid" | "buffer_mode_invalid"
  | "buffer_percent_missing" | "buffer_percent_invalid" | "monthly_commitments_missing"
  | "buffer_weeks_missing" | "buffer_weeks_invalid" | "weekly_expenses_amount_invalid"
  | "tax_protection_missing" | "tax_protection_currency_missing" | "tax_protection_currency_mismatch"
  | "tax_protection_currency_unsupported"

export interface CommitGuardProtectionQuality {
  state: "complete" | "missing" | "stale" | "unsupported_currency" | "incomplete" | "disabled"
  reasons: CommitGuardProtectionReason[]
}

/** Shared primary-state precedence; retain all reasons, not just the primary one. */
export function getCommitGuardProtectionQuality(
  reasons: readonly CommitGuardProtectionReason[],
): CommitGuardProtectionQuality {
  const unique = [...new Set(reasons)]
  const state = unique.includes("module_disabled") ? "disabled"
    : unique.some((reason) => ["cash_missing", "cash_currency_missing", "weekly_expenses_missing",
      "buffer_weeks_missing", "buffer_percent_missing", "monthly_commitments_missing",
      "tax_protection_missing", "tax_protection_currency_missing", "tax_configuration_missing",
      "tax_categories_missing", "tax_source_data_missing"].includes(reason)) ? "missing"
    : unique.some((reason) => reason === "cash_stale" || reason === "weekly_expenses_stale") ? "stale"
    : unique.some((reason) => reason.includes("currency") || reason === "mixed_currencies" ||
      reason === "tax_source_currencies_mixed") ? "unsupported_currency"
    : unique.length ? "incomplete" : "complete"
  return { state, reasons: unique }
}

export interface CommitGuardProtectionCashInput {
  amountCents: number | null
  currency: string | null
  balanceAsOf: string | null
  weeklyOperatingExpensesCents: number | null
  weeklyExpensesCurrency: string | null
  weeklyExpensesAsOf: string | null
}

export interface CommitGuardSafetyBufferInput {
  settings: Pick<CommitGuardSettingsSnapshot, "safetyBufferMode" | "safetyBufferFixedCents" |
    "safetyBufferCurrency" | "safetyBufferPercent" | "safetyBufferWeeks">
  cashContext: Pick<CommitGuardProtectionCashInput, "currency" | "weeklyOperatingExpensesCents" |
    "weeklyExpensesCurrency" | "weeklyExpensesAsOf">
  // Explicitly the compatible 30-day total, never the selected-horizon total.
  monthlyCommitmentsCents: number | null
  now: Date
}

function validCents(value: number, signed = false): boolean {
  return Number.isInteger(value) && value >= (signed ? INT_MIN : 0) && value <= INT_MAX
}

export function resolveCommitGuardSafetyBuffer(input: CommitGuardSafetyBufferInput): {
  amountCents: number | null
  quality: CommitGuardProtectionQuality
} {
  const { settings, cashContext: cash, now } = input
  const reasons: CommitGuardProtectionReason[] = getCommitGuardBufferPolicyReasons(settings, cash, now)
  if (!(settings.safetyBufferMode === "fixed_amount" && settings.safetyBufferFixedCents === 0)) {
    if (cash.currency === null) reasons.push("cash_currency_missing")
    else if (!CommitGuardCurrencySchema.safeParse(cash.currency).success) reasons.push("unsupported_currency")
  }
  let amount: number | null = null
  if (settings.safetyBufferMode === "fixed_amount") {
    if (!validCents(settings.safetyBufferFixedCents)) reasons.push("fixed_buffer_amount_invalid")
    else amount = settings.safetyBufferFixedCents
  } else if (settings.safetyBufferMode === "percentage_monthly_commitments") {
    const percent = settings.safetyBufferPercent
    if (percent == null) reasons.push("buffer_percent_missing")
    else if (!Number.isFinite(percent) || percent < 0 || percent > 100) reasons.push("buffer_percent_invalid")
    if (input.monthlyCommitmentsCents == null) reasons.push("monthly_commitments_missing")
    else if (!validCents(input.monthlyCommitmentsCents)) reasons.push("invalid_amount")
    if (reasons.length === 0) amount = Math.round(input.monthlyCommitmentsCents! * percent! / 100)
  } else if (settings.safetyBufferMode === "weeks_operating_expenses") {
    const weeks = settings.safetyBufferWeeks
    if (weeks == null) reasons.push("buffer_weeks_missing")
    else if (!Number.isFinite(weeks) || weeks < 0 || weeks > 24) reasons.push("buffer_weeks_invalid")
    if (cash.weeklyOperatingExpensesCents !== null && !validCents(cash.weeklyOperatingExpensesCents)) {
      reasons.push("weekly_expenses_amount_invalid")
    }
    if (reasons.length === 0) amount = Math.round(cash.weeklyOperatingExpensesCents! * weeks!)
  } else reasons.push("buffer_mode_invalid")
  if (amount !== null && !validCents(amount)) reasons.push("amount_overflow")
  const quality = getCommitGuardProtectionQuality(reasons)
  return { amountCents: quality.state === "complete" ? amount : null, quality }
}

export interface CommitGuardProtectionComposition {
  currency: string | null
  selectedHorizonDays: CommitmentProtectionProjection["selectedHorizonDays"]
  committedCashCents: number | null
  taxProtectedCashCents: number | null
  safetyBufferCents: number | null
  protectedCashCents: number | null
  freeCashCents: number | null
  status: FreeCashStatus | null
  quality: CommitGuardProtectionQuality
}

/** No I/O or inferred tax/cash facts. Ready for service composition, not a v2 DTO.
 * Tax/overlap adapters may supply additional reasons; unknown is explicitly null.
 * Cash DTO freshness flags are deliberately not trusted: both dates use this clock.
 */
export function composeCommitGuardProtection(input: {
  settings: CommitGuardSettingsSnapshot
  cashContext: CommitGuardProtectionCashInput
  commitmentProtection: CommitmentProtectionProjection
  taxProtection: { amountCents: number | null; currency: string | null }
  reasons?: readonly CommitGuardProtectionReason[]
  now: Date
}): CommitGuardProtectionComposition {
  const { settings, cashContext: cash, commitmentProtection: projection, taxProtection: tax, now } = input
  const buffer = resolveCommitGuardSafetyBuffer({ settings, cashContext: cash,
    monthlyCommitmentsCents: projection.monthlyCommitmentsCents, now })
  const reasons: CommitGuardProtectionReason[] = [...(input.reasons ?? []), ...buffer.quality.reasons]
  if (!settings.enabled) reasons.push("module_disabled")
  if (cash.amountCents === null || cash.balanceAsOf === null) reasons.push("cash_missing")
  if (cash.amountCents !== null && !validCents(cash.amountCents, true)) reasons.push("cash_amount_invalid")
  if (cash.currency === null) reasons.push("cash_currency_missing")
  else if (!CommitGuardCurrencySchema.safeParse(cash.currency).success) reasons.push("unsupported_currency")
  try {
    if (getCommitGuardInputFreshness(cash.balanceAsOf, now) === "stale") reasons.push("cash_stale")
  } catch { reasons.push("cash_date_invalid") }
  if (projection.unavailableReason !== null) reasons.push(projection.unavailableReason)
  if (projection.cashCurrency !== cash.currency) reasons.push("currency_mismatch")
  if (settings.safetyBufferMode === "percentage_monthly_commitments" &&
    projection.horizonsByCurrency.some((group) => group.currency !== cash.currency &&
      group.horizons.some((row) => row.days === 30 && row.occurrenceCount > 0))) {
    reasons.push("currency_mismatch")
  }
  const committed = projection.selectedCurrencyTotals?.totalCents ?? null
  if (committed === null) reasons.push("currency_context_required")
  else if (!validCents(committed)) reasons.push("invalid_amount")
  if (tax.amountCents === null) reasons.push("tax_protection_missing")
  else if (!validCents(tax.amountCents)) reasons.push("invalid_amount")
  // Explicit zero/not-applicable protection is currency-neutral.
  else if (tax.amountCents > 0) {
    if (tax.currency === null) reasons.push("tax_protection_currency_missing")
    else if (!CommitGuardCurrencySchema.safeParse(tax.currency).success) reasons.push("tax_protection_currency_unsupported")
    else if (tax.currency !== cash.currency) reasons.push("tax_protection_currency_mismatch")
  }
  let protectedCashCents: number | null = null
  let freeCashCents: number | null = null
  let status: FreeCashStatus | null = null
  if (reasons.length === 0) {
    const protectedAmount = committed! + tax.amountCents! + buffer.amountCents!
    const freeAmount = cash.amountCents! - protectedAmount
    if (!validCents(protectedAmount) || !validCents(freeAmount, true)) reasons.push("amount_overflow")
    else {
      protectedCashCents = protectedAmount
      freeCashCents = freeAmount
      status = classifyCommitGuardFreeCash(freeAmount, buffer.amountCents!)
    }
  }
  return { currency: cash.currency, selectedHorizonDays: projection.selectedHorizonDays,
    committedCashCents: committed !== null && validCents(committed) ? committed : null,
    taxProtectedCashCents: tax.amountCents !== null && validCents(tax.amountCents) &&
      (tax.amountCents === 0 || tax.currency === cash.currency && CommitGuardCurrencySchema.safeParse(tax.currency).success)
      ? tax.amountCents : null,
    safetyBufferCents: buffer.amountCents, protectedCashCents, freeCashCents, status,
    quality: getCommitGuardProtectionQuality(reasons) }
}

/** Exact inclusive thresholds in cents, including zero cash with zero buffer. */
export function classifyCommitGuardFreeCash(freeCents: number, bufferCents: number): FreeCashStatus {
  if (!validCents(freeCents, true) || !validCents(bufferCents)) {
    throw new RangeError("Safety classification requires bounded integer cents")
  }
  return freeCents < 0 ? "shortfall" : freeCents * 4 <= bufferCents ? "at_risk"
    : freeCents <= bufferCents ? "watch" : "safe"
}