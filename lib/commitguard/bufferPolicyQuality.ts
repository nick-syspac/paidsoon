import {
  CommitGuardCurrencySchema,
  getCommitGuardInputFreshness,
  type CommitGuardCashContextDto,
} from "@/lib/commitguard/cashContext"
import type { CommitGuardSettingsSnapshot } from "@/lib/commitguard/types"

export type CommitGuardBufferPolicyReason =
  | "fixed_buffer_currency_review_required"
  | "fixed_buffer_currency_unsupported"
  | "fixed_buffer_currency_mismatch"
  | "weekly_expenses_missing"
  | "weekly_expenses_stale"
  | "weekly_expenses_date_invalid"
  | "weekly_expenses_currency_unsupported"
  | "weekly_expenses_currency_mismatch"

/**
 * Currency/date eligibility only, for later summary composition. Does not calculate
 * buffer amounts or assert complete free cash. Cash availability is checked separately.
 * Neither settings updatedAt nor a new cash date refreshes an expense attestation.
 */
export function getCommitGuardBufferPolicyReasons(
  settings: Pick<CommitGuardSettingsSnapshot, "safetyBufferMode" | "safetyBufferFixedCents" | "safetyBufferCurrency">,
  cash: Omit<Pick<CommitGuardCashContextDto, "currency" | "weeklyOperatingExpensesCents" | "weeklyExpensesCurrency" | "weeklyExpensesAsOf">,
    "currency" | "weeklyExpensesCurrency"> & { currency: string | null; weeklyExpensesCurrency: string | null },
  now: Date = new Date(),
): CommitGuardBufferPolicyReason[] {
  if (settings.safetyBufferMode === "fixed_amount") {
    // Explicit zero is currency-neutral, unlike a positive legacy untagged amount.
    if (settings.safetyBufferFixedCents === 0) return []
    if (settings.safetyBufferCurrency == null) return ["fixed_buffer_currency_review_required"]
    if (!CommitGuardCurrencySchema.safeParse(settings.safetyBufferCurrency).success) {
      return ["fixed_buffer_currency_unsupported"]
    }
    return cash.currency !== null && settings.safetyBufferCurrency !== cash.currency
      ? ["fixed_buffer_currency_mismatch"] : []
  }
  if (settings.safetyBufferMode !== "weeks_operating_expenses") return []
  if (cash.weeklyOperatingExpensesCents === null || cash.weeklyExpensesCurrency === null ||
    cash.weeklyExpensesAsOf === null) return ["weekly_expenses_missing"]

  const reasons: CommitGuardBufferPolicyReason[] = []
  try {
    if (getCommitGuardInputFreshness(cash.weeklyExpensesAsOf, now) === "stale") {
      reasons.push("weekly_expenses_stale")
    }
  } catch {
    reasons.push("weekly_expenses_date_invalid")
  }
  if (!CommitGuardCurrencySchema.safeParse(cash.weeklyExpensesCurrency).success) {
    reasons.push("weekly_expenses_currency_unsupported")
  }
  if (cash.currency !== null && cash.weeklyExpensesCurrency !== cash.currency) {
    reasons.push("weekly_expenses_currency_mismatch")
  }
  return reasons
}