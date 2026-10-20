import { z } from "zod"
import { CommitGuardCurrencySchema } from "@/lib/commitguard/cashContext"

export const CommitGuardDetectionMinOccurrencesSchema = z.number().int().min(2).max(10)
export const CommitGuardRenewalWarningDaysSchema = z.array(z.number().int().min(1).max(365)).min(1).max(12)

/** Text stays a local draft until save. Never drop invalid tokens or restore defaults. */
export function parseCommitGuardWarningDraft(text: string): number[] | null {
  const tokens = text.split(",").map((token) => token.trim())
  if (tokens.some((token) => !/^\d+$/.test(token))) return null
  const parsed = CommitGuardRenewalWarningDaysSchema.safeParse(tokens.map(Number))
  return parsed.success ? [...new Set(parsed.data)].sort((a, b) => b - a) : null
}

/** Partial policy writes remain compatible with legacy settings/API callers. */
export const CommitGuardSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  defaultHorizonDays: z.number().int().refine((value) => [7, 30, 60, 90].includes(value)).optional(),
  safetyBufferMode: z.enum(["fixed_amount", "percentage_monthly_commitments", "weeks_operating_expenses"]).optional(),
  safetyBufferFixedCents: z.number().int().min(0).max(2_147_483_647).optional(),
  // Omission preserves the stored tag (including legacy unknown); never infer from cash.
  safetyBufferCurrency: CommitGuardCurrencySchema.nullable().optional(),
  safetyBufferPercent: z.number().min(0).max(100).nullable().optional(),
  safetyBufferWeeks: z.number().min(0).max(24).nullable().optional(),
  detectRecurringCommitments: z.boolean().optional(),
  detectionMinOccurrences: CommitGuardDetectionMinOccurrencesSchema.optional(),
  detectionAmountVariancePercent: z.number().min(1).max(100).optional(),
  detectionIntervalToleranceDays: z.number().int().min(1).max(30).optional(),
  detectionConfidenceThreshold: z.enum(["confirmed", "high", "medium", "low"]).optional(),
  alertCommitmentDueSoon: z.boolean().optional(),
  alertRenewalApproaching: z.boolean().optional(),
  alertNoticePeriodApproaching: z.boolean().optional(),
  alertCommitmentAmountChanged: z.boolean().optional(),
  alertCommitmentBufferLow: z.boolean().optional(),
  alertCommitmentShortfall: z.boolean().optional(),
  renewalWarningDays: CommitGuardRenewalWarningDaysSchema.optional(),
}).strict()

export type CommitGuardSettingsInput = z.infer<typeof CommitGuardSettingsSchema>

/** Persisted execution policy must be valid; detection never repairs it by writing defaults. */
export const CommitGuardDetectionPolicySchema = CommitGuardSettingsSchema.pick({
  detectionMinOccurrences: true,
  detectionAmountVariancePercent: true,
  detectionIntervalToleranceDays: true,
  detectionConfidenceThreshold: true,
}).required()