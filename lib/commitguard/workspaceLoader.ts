import { requireFeature } from "@/lib/billing"
import { withUserContext } from "@/lib/db/withUserContext"
import { requireCommitGuardCoreAccess, getCommitGuardEntitlements } from "@/lib/commitguard/entitlements"
import { loadCommitGuardSummaryInputInTransaction } from "@/lib/commitguard/service"
import { buildCommitGuardSummary } from "@/lib/commitguard/summary"
import { listCommitGuardAlertsInTransaction, loadAlertCommitmentInTransaction } from "@/lib/commitguard/alertHistory"
import { safeCandidateDate, safeCandidateEvidence } from "@/lib/commitguard/candidatePresentation"
import { WorkspaceQuerySchema, type CommitGuardWorkspaceDTO, type WorkspaceQuery } from "@/lib/commitguard/workspace"
import { selectWorkspaceCommitments } from "@/lib/commitguard/workspaceFilters"

/** No nested reader transactions/default writes. All displayed financial state
 * comes from this one tenant RLS snapshot and one injected evaluation clock. */
export async function loadCommitGuardWorkspace(userId: string, query: WorkspaceQuery = {}, now = new Date()): Promise<CommitGuardWorkspaceDTO> {
  const params = WorkspaceQuerySchema.parse(query)
  await requireCommitGuardCoreAccess(userId)
  const [tax, detection, advanced, entitlements] = await Promise.all([
    requireFeature(userId, "tax_buffer_basic", { now }), requireFeature(userId, "commitguard_detection", { now }),
    requireFeature(userId, "commitguard_advanced_alerts", { now }), getCommitGuardEntitlements(userId),
  ])
  return withUserContext(userId, async (tx) => {
    const [input, rows, alerts, linkedCommitment] = await Promise.all([
      loadCommitGuardSummaryInputInTransaction(tx, userId, tax, now),
      detection ? tx.commitmentDetectionCandidate.findMany({ where: { userId },
        orderBy: [{ status: "asc" }, { lastDetectedAt: "desc" }], take: entitlements.detectionCandidatesPerCycleLimit }) : [],
      listCommitGuardAlertsInTransaction(tx, userId, { page: Number(params.alertPage ?? 1), eventId: params.eventId }, now, advanced, detection),
      params.commitmentId ? loadAlertCommitmentInTransaction(tx, userId, params.commitmentId) : null,
    ])
    const summary = buildCommitGuardSummary(input)
    const commitments = input.commitments.map((row) => ({ id: row.id, name: row.name, category: row.category,
      amountCents: row.amountCents, currency: row.currency, frequency: row.frequency,
      nextDueDate: row.nextDueDate?.toISOString() ?? null, confidence: row.confidence, status: row.status,
      supplierName: row.supplierName, notes: row.notes, linkedCostGuardAlertId: row.linkedCostGuardAlertId,
      essentiality: row.essentiality, source: row.source, linkedSpendInsightId: row.linkedSpendInsightId,
      description: row.description, startDate: row.startDate?.toISOString() ?? null, endDate: row.endDate?.toISOString() ?? null,
      renewalDate: row.renewalDate?.toISOString() ?? null, noticePeriodDays: row.noticePeriodDays,
      autoRenew: row.autoRenew, cancellable: row.cancellable, archivedAt: row.archivedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString() }))
    const candidates = rows.map((row) => ({ id: row.id, name: row.name, category: row.category,
      frequency: row.frequency, typicalAmountCents: row.typicalAmountCents, currency: row.currency,
      source: row.source, confidence: row.confidence, status: row.status, supplierName: row.supplierName,
      suggestedDueDate: safeCandidateDate(row.suggestedDueDate), latestObservedAt: safeCandidateDate(row.latestObservedAt),
      recurrenceAnchor: safeCandidateDate(row.recurrenceAnchor), evidence: safeCandidateEvidence(row.evidence),
      evidenceReviewRequired: Boolean(row.userCorrections && typeof row.userCorrections === "object" &&
        Object.keys(row.userCorrections).length && row.correctionsEvidenceFingerprint !== row.evidenceFingerprint),
      conversionReviewRequired: row.conversionReviewRequired }))
    return { version: 1, asOf: summary.asOf, calculationRevision: summary.calculationRevision,
      cashInputRevision: summary.inputRevision, summary: { ...summary, renewals: summary.renewals.map((row) => ({ ...row,
        renewalDate: row.renewalDate.toISOString(), noticeCloseDate: row.noticeCloseDate.toISOString() })) },
      cashContext: input.cashContext, settings: input.settings, detectionEnabled: detection,
      commitments, upcoming: selectWorkspaceCommitments(commitments, params, summary.asOf), candidates,
      reviewCount: candidates.filter((row) => row.status === "pending").length, alerts, linkedCommitment }
  }, { isolationLevel: "RepeatableRead" })
}