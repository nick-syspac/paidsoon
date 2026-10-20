import { buildCommitGuardSummary } from "@/lib/commitguard/summary"
import { toCommitGuardCashContextDto } from "@/lib/commitguard/cashContext"
import type { CommitmentSnapshot, CommitGuardSettingsSnapshot } from "@/lib/commitguard/types"
import type { CommitGuardWorkspaceDTO } from "@/lib/commitguard/workspace"
import { selectWorkspaceCommitments } from "@/lib/commitguard/workspaceFilters"

export const workspaceNow = new Date("2026-10-19T12:00:00Z")
export const workspaceSettings: CommitGuardSettingsSnapshot = {
  enabled: true, defaultHorizonDays: 30, safetyBufferMode: "fixed_amount", safetyBufferFixedCents: 0,
  safetyBufferCurrency: null, safetyBufferPercent: null, safetyBufferWeeks: null,
  detectRecurringCommitments: true, detectionMinOccurrences: 3, detectionAmountVariancePercent: 12,
  detectionIntervalToleranceDays: 3, detectionConfidenceThreshold: "medium", alertCommitmentDueSoon: true,
  alertRenewalApproaching: true, alertNoticePeriodApproaching: true, alertCommitmentAmountChanged: true,
  alertCommitmentBufferLow: true, alertCommitmentShortfall: true, renewalWarningDays: [90, 60, 30, 14, 7],
}
export const workspaceCommitment: CommitmentSnapshot = {
  id: "commitment-1", userId: "tenant-a", name: "Synthetic subscription", description: null,
  category: "software", amountCents: 10000, currency: "aud", frequency: "monthly",
  nextDueDate: new Date("2026-10-21Z"), startDate: null, endDate: null, recurrenceRule: null,
  supplierName: null, supplierId: null, accountId: null, source: "manual", status: "active", confidence: "confirmed",
  noticePeriodDays: 7, renewalDate: new Date("2026-11-01Z"), autoRenew: true, cancellable: true,
  essentiality: "operational", notes: null, linkedSpendInsightId: null, linkedCostGuardAlertId: null,
  archivedAt: null, createdAt: workspaceNow, updatedAt: workspaceNow,
}
export function syntheticWorkspace(revision = 1, cashRevision = revision): CommitGuardWorkspaceDTO {
  const cashContext = toCommitGuardCashContextDto({ amountCents: 500000, currency: "aud", balanceAsOf: new Date("2026-10-19Z"),
    weeklyOperatingExpensesCents: null, weeklyExpensesCurrency: null, weeklyExpensesAsOf: null, taxProtectionCurrency: null,
    revision: cashRevision }, workspaceNow)
  const summary = buildCommitGuardSummary({ settings: workspaceSettings, calculationRevision: revision,
    cashContext, commitments: [workspaceCommitment], now: workspaceNow,
    tax: { asOf: workspaceNow.toISOString(), applicable: false, amountCents: 0, currency: null, categories: [], quality: { state: "not_applicable", reasons: ["not_applicable"] } },
    coverage: { sources: { userId: "tenant-a", taxApplicable: false, commitments: [workspaceCommitment], bills: [], taxCategories: [] }, rows: [] } })
  const commitments = [{ id: "commitment-1", name: workspaceCommitment.name,
    category: "software", amountCents: 10000, currency: "aud", frequency: "monthly", nextDueDate: "2026-10-21T00:00:00Z",
    confidence: "confirmed", status: "active", supplierName: null, notes: null, linkedCostGuardAlertId: null,
    essentiality: "operational", source: "manual", linkedSpendInsightId: null, updatedAt: workspaceNow.toISOString(),
    description: null, startDate: null, endDate: null, renewalDate: workspaceCommitment.renewalDate!.toISOString(),
    noticePeriodDays: 7, autoRenew: true, cancellable: true, archivedAt: null }]
  return { version: 1, asOf: summary.asOf, calculationRevision: revision, cashInputRevision: cashRevision,
    summary: { ...summary, renewals: summary.renewals.map((row) => ({ ...row, renewalDate: row.renewalDate.toISOString(), noticeCloseDate: row.noticeCloseDate.toISOString() })) },
    cashContext, settings: workspaceSettings, commitments, upcoming: selectWorkspaceCommitments(commitments, {}, summary.asOf),
    candidates: [], reviewCount: 0, detectionEnabled: true, linkedCommitment: null,
    alerts: { alerts: [], page: 1, totalPages: 1, total: 0, evaluation: { available: false, lastEvaluatedAt: null }, eventFound: true } }
}