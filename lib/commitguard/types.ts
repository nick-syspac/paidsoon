export type CommitmentFrequency =
  | "one_off"
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "six_monthly"
  | "annual"
  | "custom"

export type CommitmentStatus =
  | "active"
  | "upcoming"
  | "ending"
  | "cancelled"
  | "expired"
  | "paused"
  | "review"

export type CommitmentSource =
  | "manual"
  | "accounting_integration"
  | "bank_transaction_pattern"
  | "spendleak"
  | "costguard"
  | "import"
  | "system_inferred"

export type CommitmentConfidence = "confirmed" | "high" | "medium" | "low"

export type CommitmentEssentiality =
  | "critical"
  | "essential"
  | "operational"
  | "discretionary"

export type RenewalSeverity = "info" | "watch" | "action_required" | "urgent"

export type FreeCashStatus = "safe" | "watch" | "at_risk" | "shortfall"

export type SafetyBufferMode =
  | "fixed_amount"
  | "percentage_monthly_commitments"
  | "weeks_operating_expenses"

export interface CommitGuardSettingsSnapshot {
  enabled: boolean
  defaultHorizonDays: number
  safetyBufferMode: SafetyBufferMode
  safetyBufferFixedCents: number
  safetyBufferPercent: number | null
  safetyBufferWeeks: number | null
  detectRecurringCommitments: boolean
  detectionMinOccurrences: number
  detectionAmountVariancePercent: number
  detectionIntervalToleranceDays: number
  detectionConfidenceThreshold: CommitmentConfidence
  alertCommitmentDueSoon: boolean
  alertRenewalApproaching: boolean
  alertNoticePeriodApproaching: boolean
  alertCommitmentAmountChanged: boolean
  alertCommitmentBufferLow: boolean
  alertCommitmentShortfall: boolean
  renewalWarningDays: number[]
}

export interface CommitmentSnapshot {
  id: string
  userId: string
  name: string
  description: string | null
  category: string
  amountCents: number
  currency: string
  frequency: CommitmentFrequency
  nextDueDate: Date | null
  startDate: Date | null
  endDate: Date | null
  recurrenceRule: unknown
  supplierName: string | null
  supplierId: string | null
  accountId: string | null
  source: CommitmentSource
  status: CommitmentStatus
  confidence: CommitmentConfidence
  noticePeriodDays: number | null
  renewalDate: Date | null
  autoRenew: boolean
  cancellable: boolean
  essentiality: CommitmentEssentiality
  notes: string | null
  linkedSpendInsightId: string | null
  linkedCostGuardAlertId: string | null
  createdAt: Date
  updatedAt: Date
}

const FREQUENCIES: CommitmentFrequency[] = [
  "one_off",
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "six_monthly",
  "annual",
  "custom",
]

const STATUSES: CommitmentStatus[] = [
  "active",
  "upcoming",
  "ending",
  "cancelled",
  "expired",
  "paused",
  "review",
]

const SOURCES: CommitmentSource[] = [
  "manual",
  "accounting_integration",
  "bank_transaction_pattern",
  "spendleak",
  "costguard",
  "import",
  "system_inferred",
]

const CONFIDENCES: CommitmentConfidence[] = ["confirmed", "high", "medium", "low"]

const ESSENTIALITIES: CommitmentEssentiality[] = [
  "critical",
  "essential",
  "operational",
  "discretionary",
]

const BUFFER_MODES: SafetyBufferMode[] = [
  "fixed_amount",
  "percentage_monthly_commitments",
  "weeks_operating_expenses",
]

export function normalizeCommitmentFrequency(value: string | null | undefined): CommitmentFrequency {
  const normalized = (value ?? "").trim().toLowerCase().replace(/-/g, "_")
  return FREQUENCIES.includes(normalized as CommitmentFrequency)
    ? (normalized as CommitmentFrequency)
    : "one_off"
}

export function normalizeCommitmentStatus(value: string | null | undefined): CommitmentStatus {
  const normalized = (value ?? "").trim().toLowerCase().replace(/-/g, "_")
  return STATUSES.includes(normalized as CommitmentStatus)
    ? (normalized as CommitmentStatus)
    : "active"
}

export function normalizeCommitmentSource(value: string | null | undefined): CommitmentSource {
  const normalized = (value ?? "").trim().toLowerCase().replace(/-/g, "_")
  return SOURCES.includes(normalized as CommitmentSource)
    ? (normalized as CommitmentSource)
    : "manual"
}

export function normalizeCommitmentConfidence(value: string | null | undefined): CommitmentConfidence {
  const normalized = (value ?? "").trim().toLowerCase().replace(/-/g, "_")
  return CONFIDENCES.includes(normalized as CommitmentConfidence)
    ? (normalized as CommitmentConfidence)
    : "medium"
}

export function normalizeCommitmentEssentiality(
  value: string | null | undefined,
): CommitmentEssentiality {
  const normalized = (value ?? "").trim().toLowerCase().replace(/-/g, "_")
  return ESSENTIALITIES.includes(normalized as CommitmentEssentiality)
    ? (normalized as CommitmentEssentiality)
    : "operational"
}

export function normalizeSafetyBufferMode(value: string | null | undefined): SafetyBufferMode {
  const normalized = (value ?? "").trim().toLowerCase().replace(/-/g, "_")
  return BUFFER_MODES.includes(normalized as SafetyBufferMode)
    ? (normalized as SafetyBufferMode)
    : "fixed_amount"
}
