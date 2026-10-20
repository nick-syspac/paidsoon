import type { CommitGuardSummary } from "@/lib/commitguard/summary"
import type { CommitGuardCashContextDto } from "@/lib/commitguard/cashContext"
import type { CandidateDisplay } from "@/lib/commitguard/candidatePresentation"
import type { CommitGuardAlertPageDTO } from "@/lib/commitguard/alertPresentation"
import type { WorkspaceCommitmentPage } from "@/lib/commitguard/workspaceFilters"
export { WorkspaceQuerySchema, type WorkspaceQuery } from "@/lib/commitguard/workspaceFilters"
export type WorkspaceCommitment = {
  id: string; name: string; category: string; amountCents: number; currency: string;
  frequency: string; nextDueDate: string | null; confidence: string; status: string;
  supplierName: string | null; notes: string | null; linkedCostGuardAlertId: string | null; updatedAt: string;
  essentiality: string; source: string; linkedSpendInsightId: string | null
  description: string | null; startDate: string | null; endDate: string | null;
  renewalDate: string | null; noticePeriodDays: number | null; autoRenew: boolean; cancellable: boolean;
  archivedAt: string | null
}
// JSON boundary: renewal dates are strings, never an implicit Date revival.
export type WorkspaceSummary = Omit<CommitGuardSummary, "renewals"> & {
  renewals: Array<Omit<CommitGuardSummary["renewals"][number], "renewalDate" | "noticeCloseDate"> & {
    renewalDate: string; noticeCloseDate: string
  }>
}
export type CommitGuardWorkspaceDTO = {
  version: 1; asOf: string; calculationRevision: number; cashInputRevision: number;
  summary: WorkspaceSummary; cashContext: CommitGuardCashContextDto;
  settings: CommitGuardSummary["settings"]; commitments: WorkspaceCommitment[]; upcoming: WorkspaceCommitmentPage;
  candidates: CandidateDisplay[]; reviewCount: number; detectionEnabled: boolean;
  alerts: CommitGuardAlertPageDTO;
  linkedCommitment: { name: string; status: string; amount: string; nextDueDate: string | null; archived: boolean } | null
}

export function workspaceSummaryForDisplay(summary: WorkspaceSummary): CommitGuardSummary {
  return { ...summary, renewals: summary.renewals.map((row) => ({ ...row,
    renewalDate: new Date(row.renewalDate), noticeCloseDate: new Date(row.noticeCloseDate) })) }
}