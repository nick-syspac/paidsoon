import { COMMIT_GUARD_EVENT_TYPES } from "@/lib/commitguard/events"

export interface LegacyConversionCandidate {
  readonly id: string
  readonly userId: string
  readonly status: string
  readonly conversionReviewRequired: boolean
}

export interface LegacyConversionCommitment {
  readonly id: string
  readonly userId: string
  readonly sourceDetectionCandidateId: string | null
}

export interface LegacyConversionEvent {
  readonly id: string
  readonly userId: string
  readonly eventType: string
  readonly commitmentId: string | null
  readonly detectionCandidateId: string | null
  readonly metadata: unknown
}

export type LegacyConversionReviewReason =
  | "missing_audit_evidence"
  | "invalid_source_candidate_metadata"
  | "missing_candidate"
  | "missing_commitment"
  | "cross_tenant_reference"
  | "conflicting_candidate_reference"
  | "duplicate_audit_evidence"
  | "multiple_resulting_commitments"
  | "commitment_claimed_by_multiple_candidates"
  | "conflicting_existing_source_link"
  | "existing_review_required"

export interface LegacyConversionReportEntry {
  candidateId: string
  classification: "unambiguous" | "missing" | "duplicate" | "conflicting"
  status: "ready_to_link" | "already_linked" | "conversion_review_required"
  /** Only populated when unique audit evidence and every existing link agree. */
  proposedCommitmentId: string | null
  commitmentIds: string[]
  eventIds: string[]
  reasons: LegacyConversionReviewReason[]
}

export interface LegacyConversionReport {
  dryRun: true
  entries: LegacyConversionReportEntry[]
  /** Unusable creation events, including events with no recoverable candidate. */
  eventIssues: Array<{
    eventId: string
    reasons: LegacyConversionReviewReason[]
  }>
  commitmentIssues: Array<{
    commitmentId: string
    reasons: LegacyConversionReviewReason[]
  }>
}

function sourceCandidateId(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, unknown>).sourceCandidateId
  return typeof value === "string" && value.length > 0 && value.trim() === value ? value : null
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort()
}

/**
 * Pure, advisory dry run; never applies a backfill or changes review flags.
 *
 * A trusted caller must supply a complete, unpaginated snapshot of candidates,
 * commitments (including archived rows), and creation events for the tenant.
 * Optional foreign rows allow explicit cross-tenant diagnostics; unresolved IDs
 * otherwise fail closed as missing. This is NOT an authorization boundary: any
 * future loader must authenticate/authorize the operator and use tenant-scoped
 * reads. No DB clients, logging, financial values, or external input entry points
 * belong here. Results contain only tenant-owned IDs and fixed reason codes.
 * Duplicate input primary keys are rejected rather than silently overwritten.
 */
export function buildLegacyConversionReport(input: {
  readonly userId: string
  readonly candidates: readonly LegacyConversionCandidate[]
  readonly commitments: readonly LegacyConversionCommitment[]
  readonly events: readonly LegacyConversionEvent[]
}): LegacyConversionReport {
  function index<T extends { readonly id: string }>(rows: readonly T[]): Map<string, T> {
    const result = new Map<string, T>()
    for (const row of rows) {
      if (result.has(row.id)) throw new Error("Duplicate reconciliation snapshot ID")
      result.set(row.id, row)
    }
    return result
  }

  const candidates = index(input.candidates)
  const commitments = index(input.commitments)
  // Validate snapshot identity even for events that are not conversion evidence.
  index(input.events)
  const localCandidates = input.candidates.filter((row) => row.userId === input.userId)
  const localCommitments = input.commitments.filter((row) => row.userId === input.userId)
  const evidence = input.events.filter(
    (row) => row.eventType === COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CREATED_FROM_DETECTION,
  )
  const reasons = new Map<string, Set<LegacyConversionReviewReason>>()
  const eventIds = new Map<string, Set<string>>()
  const targets = new Map<string, Set<string>>()
  const claims = new Map<string, Set<string>>()
  const eventIssues: LegacyConversionReport["eventIssues"] = []
  const commitmentIssues: LegacyConversionReport["commitmentIssues"] = []
  const inspectedEvents: Array<{
    event: LegacyConversionEvent
    issues: Set<LegacyConversionReviewReason>
  }> = []

  for (const candidate of localCandidates) {
    reasons.set(candidate.id, new Set())
    eventIds.set(candidate.id, new Set())
    targets.set(candidate.id, new Set())
  }

  function claim(candidateId: string, commitmentId: string): void {
    const claimants = claims.get(commitmentId) ?? new Set<string>()
    claimants.add(candidateId)
    claims.set(commitmentId, claimants)
  }

  // Existing links constrain the report, but are never themselves audit proof.
  for (const commitment of input.commitments) {
    const candidateId = commitment.sourceDetectionCandidateId
    if (!candidateId) continue
    claim(candidateId, commitment.id)
    if (commitment.userId === input.userId) {
      const source = candidates.get(candidateId)
      if (!source || source.userId !== input.userId) {
        commitmentIssues.push({
          commitmentId: commitment.id,
          reasons: [source ? "cross_tenant_reference" : "missing_candidate"],
        })
      }
    }
    if (!reasons.has(candidateId)) continue
    if (commitment.userId !== input.userId) {
      reasons.get(candidateId)!.add("cross_tenant_reference")
    } else {
      targets.get(candidateId)!.add(commitment.id)
    }
  }

  for (const event of evidence) {
    const metadataId = sourceCandidateId(event.metadata)
    const candidate = metadataId ? candidates.get(metadataId) : undefined
    const commitment = event.commitmentId ? commitments.get(event.commitmentId) : undefined
    const relatedIds = new Set(
      [metadataId, event.detectionCandidateId, commitment?.sourceDetectionCandidateId].filter(
        (id): id is string => id !== null && id !== undefined,
      ),
    )
    // Count all claims, even malformed/conflicting events: never let a bad row
    // make another candidate's competing claim appear unambiguous.
    if (event.commitmentId) {
      for (const id of relatedIds) claim(id, event.commitmentId)
    }
    const issues = new Set<LegacyConversionReviewReason>()
    if (!metadataId) issues.add("invalid_source_candidate_metadata")
    else if (!candidate) issues.add("missing_candidate")
    if (!commitment) issues.add("missing_commitment")
    if (
      event.userId !== input.userId ||
      (candidate && candidate.userId !== input.userId) ||
      (commitment && commitment.userId !== input.userId) ||
      (event.detectionCandidateId &&
        candidates.has(event.detectionCandidateId) &&
        candidates.get(event.detectionCandidateId)!.userId !== input.userId)
    ) {
      issues.add("cross_tenant_reference")
    }
    if (event.detectionCandidateId && event.detectionCandidateId !== metadataId) {
      issues.add("conflicting_candidate_reference")
    }
    if (event.detectionCandidateId && !candidates.has(event.detectionCandidateId)) {
      issues.add("missing_candidate")
    }
    if (
      commitment?.sourceDetectionCandidateId &&
      commitment.sourceDetectionCandidateId !== metadataId
    ) {
      issues.add("conflicting_existing_source_link")
    }

    if (event.userId === input.userId && issues.size > 0) {
      eventIssues.push({ eventId: event.id, reasons: [...issues].sort() })
    }
    inspectedEvents.push({ event, issues })
    for (const id of relatedIds) {
      const candidateReasons = reasons.get(id)
      if (!candidateReasons) continue
      for (const reason of issues) candidateReasons.add(reason)
      if (event.userId === input.userId) eventIds.get(id)!.add(event.id)
      if (commitment?.userId === input.userId) targets.get(id)!.add(commitment.id)
    }
  }

  // A second creation event for the same target is unsafe even if its metadata
  // is missing. Propagate it to every claimant before deciding uniqueness.
  for (const { event, issues } of inspectedEvents) {
    if (!event.commitmentId) continue
    for (const id of claims.get(event.commitmentId) ?? []) {
      const candidateReasons = reasons.get(id)
      if (!candidateReasons) continue
      for (const reason of issues) candidateReasons.add(reason)
      if (event.userId === input.userId) eventIds.get(id)!.add(event.id)
      if (commitments.get(event.commitmentId)?.userId === input.userId) {
        targets.get(id)!.add(event.commitmentId)
      }
    }
  }

  // Detect many-to-one conflicts from audit claims AND persisted source links.
  for (const [commitmentId, claimants] of claims) {
    if (claimants.size < 2) continue
    for (const id of claimants) {
      reasons.get(id)?.add("commitment_claimed_by_multiple_candidates")
    }
    const linkedId = commitments.get(commitmentId)?.sourceDetectionCandidateId
    if (linkedId) reasons.get(linkedId)?.add("conflicting_existing_source_link")
  }

  const entries: LegacyConversionReportEntry[] = []
  for (const candidate of localCandidates) {
    const candidateReasons = reasons.get(candidate.id)!
    const ids = eventIds.get(candidate.id)!
    const commitmentIds = targets.get(candidate.id)!
    if (
      candidate.status !== "converted" &&
      candidate.status !== "confirmed" &&
      !candidate.conversionReviewRequired &&
      ids.size === 0 &&
      commitmentIds.size === 0 &&
      candidateReasons.size === 0
    ) continue

    if (candidate.conversionReviewRequired) candidateReasons.add("existing_review_required")
    if (ids.size === 0) candidateReasons.add("missing_audit_evidence")
    if (ids.size > 1) candidateReasons.add("duplicate_audit_evidence")
    if (commitmentIds.size > 1) candidateReasons.add("multiple_resulting_commitments")
    if (commitmentIds.size > 1 && localCommitments.some(
      (row) => row.sourceDetectionCandidateId === candidate.id,
    )) candidateReasons.add("conflicting_existing_source_link")
    const hasConflict = [...candidateReasons].some((reason) =>
      [
        "cross_tenant_reference",
        "conflicting_candidate_reference",
        "conflicting_existing_source_link",
        "commitment_claimed_by_multiple_candidates",
        "existing_review_required",
      ].includes(reason),
    )
    const classification = hasConflict
      ? "conflicting"
      : ids.size > 1 || commitmentIds.size > 1
        ? "duplicate"
        : candidateReasons.size > 0
          ? "missing"
          : "unambiguous"
    const proposedCommitmentId = classification === "unambiguous"
      ? [...commitmentIds][0] ?? null
      : null
    const alreadyLinked = proposedCommitmentId !== null && localCommitments.some(
      (row) => row.id === proposedCommitmentId && row.sourceDetectionCandidateId === candidate.id,
    )
    entries.push({
      candidateId: candidate.id,
      classification,
      status: proposedCommitmentId === null
        ? "conversion_review_required"
        : alreadyLinked ? "already_linked" : "ready_to_link",
      proposedCommitmentId,
      commitmentIds: sorted(commitmentIds),
      eventIds: sorted(ids),
      reasons: [...candidateReasons].sort(),
    })
  }

  return {
    dryRun: true,
    entries: entries.sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
    eventIssues: eventIssues.sort((a, b) => a.eventId.localeCompare(b.eventId)),
    commitmentIssues: commitmentIssues.sort((a, b) => a.commitmentId.localeCompare(b.commitmentId)),
  }
}