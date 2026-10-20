import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  buildLegacyConversionReport,
  type LegacyConversionCandidate,
  type LegacyConversionCommitment,
  type LegacyConversionEvent,
} from "@/lib/commitguard/legacyConversionReport"
import { COMMIT_GUARD_EVENT_TYPES } from "@/lib/commitguard/events"

const userId = "tenant-a"
const foreignUserId = "tenant-b"

function candidate(
  id = "candidate-a",
  patch: Partial<LegacyConversionCandidate> = {},
): LegacyConversionCandidate {
  return { id, userId, status: "converted", conversionReviewRequired: false, ...patch }
}

function commitment(
  id = "commitment-a",
  patch: Partial<LegacyConversionCommitment> = {},
): LegacyConversionCommitment {
  return { id, userId, sourceDetectionCandidateId: null, ...patch }
}

function event(id = "event-a", patch: Partial<LegacyConversionEvent> = {}): LegacyConversionEvent {
  return {
    id,
    userId,
    eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CREATED_FROM_DETECTION,
    commitmentId: "commitment-a",
    // Actual legacy writer uses metadata, not this nullable relation.
    detectionCandidateId: null,
    metadata: { sourceCandidateId: "candidate-a", confidenceScore: 0.9 },
    ...patch,
  }
}

function report(patch: Partial<Parameters<typeof buildLegacyConversionReport>[0]> = {}) {
  return buildLegacyConversionReport({
    userId,
    candidates: [candidate()],
    commitments: [commitment()],
    events: [event()],
    ...patch,
  })
}

function review(
  result: ReturnType<typeof report>,
  reason: string,
  candidateId = "candidate-a",
): void {
  const entry = result.entries.find((row) => row.candidateId === candidateId)
  assert.ok(entry)
  assert.equal(entry.status, "conversion_review_required")
  assert.equal(entry.proposedCommitmentId, null)
  assert.ok(entry.reasons.includes(reason as typeof entry.reasons[number]), reason)
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}

describe("CommitGuard legacy conversion dry-run report", () => {
  test("recovers only a unique metadata-backed tenant-matching conversion", () => {
    assert.deepEqual(report(), {
      dryRun: true,
      entries: [{
        candidateId: "candidate-a",
        classification: "unambiguous",
        status: "ready_to_link",
        proposedCommitmentId: "commitment-a",
        commitmentIds: ["commitment-a"],
        eventIds: ["event-a"],
        reasons: [],
      }],
      eventIssues: [],
      commitmentIssues: [],
    })
  })

  test("recognizes an existing matching link without proposing a second conversion", () => {
    const result = report({ commitments: [commitment(undefined, {
      sourceDetectionCandidateId: "candidate-a",
    })] })
    assert.equal(result.entries[0].status, "already_linked")
    assert.equal(result.entries[0].classification, "unambiguous")
  })

  test("requires review when converted or legacy confirmed candidates lack evidence", () => {
    for (const status of ["converted", "confirmed"]) {
      const result = report({ candidates: [candidate(undefined, { status })], events: [] })
      review(result, "missing_audit_evidence")
      assert.equal(result.entries[0].classification, "missing")
    }
  })

  test("does not accept an existing source link as substitute audit proof", () => {
    review(report({
      commitments: [commitment(undefined, { sourceDetectionCandidateId: "candidate-a" })],
      events: [],
    }), "missing_audit_evidence")
  })

  test("ignores confirmation and unrelated events as conversion proof", () => {
    review(report({ events: [event(undefined, {
      eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED_CONFIRMED,
      detectionCandidateId: "candidate-a",
    })] }), "missing_audit_evidence")
  })

  test("does not flag untouched pending, ignored, or rejected candidates", () => {
    for (const status of ["pending", "ignored", "not_a_commitment"]) {
      assert.deepEqual(report({ candidates: [candidate(undefined, { status })], events: [] }).entries, [])
    }
  })

  test("inspects historical audit proof even if the candidate was reopened", () => {
    assert.equal(report({ candidates: [candidate(undefined, { status: "pending" })] })
      .entries[0].status, "ready_to_link")
  })

  test("never clears an existing review-required flag in the report", () => {
    review(report({ candidates: [candidate(undefined, { conversionReviewRequired: true })] }),
      "existing_review_required")
  })

  test("treats repeated creation events for the same target as duplicate evidence", () => {
    const result = report({ events: [event(), event("event-b")] })
    review(result, "duplicate_audit_evidence")
    assert.equal(result.entries[0].classification, "duplicate")
  })

  test("reports historical duplicate commitments without selecting or merging one", () => {
    const result = report({
      commitments: [commitment(), commitment("commitment-b")],
      events: [event(), event("event-b", { commitmentId: "commitment-b" })],
    })
    review(result, "multiple_resulting_commitments")
    assert.deepEqual(result.entries[0].commitmentIds, ["commitment-a", "commitment-b"])
  })

  test("rejects two candidates mapping to the same commitment", () => {
    const result = report({
      candidates: [candidate(), candidate("candidate-b")],
      events: [event(), event("event-b", { metadata: { sourceCandidateId: "candidate-b" } })],
    })
    for (const id of ["candidate-a", "candidate-b"]) {
      review(result, "commitment_claimed_by_multiple_candidates", id)
    }
  })

  test("rejects metadata versus candidate-relation disagreement for both candidates", () => {
    const result = report({
      candidates: [candidate(), candidate("candidate-b")],
      events: [event(undefined, { detectionCandidateId: "candidate-b" })],
    })
    for (const id of ["candidate-a", "candidate-b"]) {
      review(result, "conflicting_candidate_reference", id)
    }
  })

  test("accepts a matching optional candidate relation", () => {
    assert.equal(report({ events: [event(undefined, { detectionCandidateId: "candidate-a" })] })
      .entries[0].classification, "unambiguous")
  })

  test("rejects a target already source-linked to another candidate", () => {
    const result = report({
      candidates: [candidate(), candidate("candidate-b")],
      commitments: [commitment(undefined, { sourceDetectionCandidateId: "candidate-b" })],
    })
    for (const id of ["candidate-a", "candidate-b"]) {
      review(result, "conflicting_existing_source_link", id)
    }
  })

  test("rejects a candidate already source-linked to a different commitment", () => {
    review(report({ commitments: [commitment(), commitment("commitment-b", {
      sourceDetectionCandidateId: "candidate-a",
    })] }), "conflicting_existing_source_link")
  })

  test("rejects multiple existing commitments claiming one candidate", () => {
    review(report({ commitments: ["commitment-a", "commitment-b"].map((id) =>
      commitment(id, { sourceDetectionCandidateId: "candidate-a" })),
    }), "multiple_resulting_commitments")
  })

  test("missing or deleted commitment references fail closed", () => {
    for (const patch of [{ commitments: [] }, { events: [event(undefined, { commitmentId: null })] }]) {
      review(report(patch), "missing_commitment")
    }
  })

  test("malformed metadata never falls back to the candidate relation", () => {
    for (const metadata of [null, [], "candidate-a", 7, {},
      { sourceCandidateId: 7 }, { sourceCandidateId: "" }, { sourceCandidateId: " candidate-a " }]) {
      const result = report({ events: [event(undefined, { metadata, detectionCandidateId: "candidate-a" })] })
      review(result, "invalid_source_candidate_metadata")
      assert.ok(result.eventIssues[0].reasons.includes("invalid_source_candidate_metadata"))
    }
  })

  test("reports orphan metadata and orphan existing links without echoing unknown IDs", () => {
    const result = report({
      events: [event(undefined, { metadata: { sourceCandidateId: "unknown-private-id" } })],
      commitments: [commitment(undefined, { sourceDetectionCandidateId: "unknown-private-id" })],
    })
    assert.ok(result.eventIssues[0].reasons.includes("missing_candidate"))
    assert.deepEqual(result.commitmentIssues, [{ commitmentId: "commitment-a", reasons: ["missing_candidate"] }])
    assert.ok(!JSON.stringify(result).includes("unknown-private-id"))
  })

  test("a malformed additional event for the same target blocks an otherwise unique mapping", () => {
    const result = report({ events: [event(), event("event-b", { metadata: null })] })
    review(result, "invalid_source_candidate_metadata")
    review(result, "duplicate_audit_evidence")
  })

  test("cross-tenant commitment targets cannot be proposed or exposed", () => {
    const result = report({
      commitments: [commitment("foreign-commitment", { userId: foreignUserId })],
      events: [event(undefined, { commitmentId: "foreign-commitment" })],
    })
    review(result, "cross_tenant_reference")
    assert.ok(!JSON.stringify(result).includes("foreign-commitment"))
  })

  test("cross-tenant source candidates are diagnosed without exposing their IDs", () => {
    const result = report({
      candidates: [candidate(), candidate("foreign-candidate", { userId: foreignUserId })],
      commitments: [commitment(undefined, { sourceDetectionCandidateId: "foreign-candidate" })],
      events: [event(undefined, { metadata: { sourceCandidateId: "foreign-candidate" } })],
    })
    assert.ok(result.eventIssues[0].reasons.includes("cross_tenant_reference"))
    assert.deepEqual(result.commitmentIssues[0].reasons, ["cross_tenant_reference"])
    assert.ok(!JSON.stringify(result).includes("foreign-candidate"))
  })

  test("foreign audit claims block local conversions without exposing foreign event IDs", () => {
    const result = report({ events: [event(), event("foreign-event", { userId: foreignUserId })] })
    review(result, "cross_tenant_reference")
    assert.ok(!JSON.stringify(result).includes("foreign-event"))
    assert.deepEqual(result.eventIssues, [])
  })

  test("foreign commitments source-linked to a local candidate require review", () => {
    const result = report({ commitments: [commitment(), commitment("foreign-commitment", {
      userId: foreignUserId, sourceDetectionCandidateId: "candidate-a",
    })] })
    review(result, "cross_tenant_reference")
    assert.ok(!JSON.stringify(result).includes("foreign-commitment"))
  })

  test("an unrelated foreign tenant does not poison the local report", () => {
    const result = report({
      candidates: [candidate(), candidate("foreign-candidate", { userId: foreignUserId })],
      commitments: [commitment(), commitment("foreign-commitment", { userId: foreignUserId })],
      events: [event(), event("foreign-event", {
        userId: foreignUserId, commitmentId: "foreign-commitment",
        metadata: { sourceCandidateId: "foreign-candidate" },
      })],
    })
    assert.deepEqual(result, report())
  })

  test("unresolved foreign references still fail closed with tenant-only snapshots", () => {
    review(report({ events: [event(undefined, { commitmentId: "unresolved-commitment" })] }),
      "missing_commitment")
  })

  test("rejects duplicate snapshot primary keys instead of collapsing ambiguous evidence", () => {
    for (const patch of [
      { candidates: [candidate(), candidate()] },
      { commitments: [commitment(), commitment()] },
      { events: [event(), event()] },
    ]) assert.throws(() => report(patch), /Duplicate reconciliation snapshot ID/)
  })

  test("dry-run fixtures remain byte-for-byte unchanged with no writes, deletes, or merges", () => {
    // Fully frozen DB-shaped fixtures trap mutations, including nested metadata.
    // No database module is imported: all input is synthetic, no live DB is used.
    const snapshot = freeze({
      userId,
      candidates: [candidate(), candidate("candidate-b")],
      commitments: [commitment(), commitment("commitment-b")],
      events: [event(), event("event-b", { commitmentId: "commitment-b" })],
    })
    const before = JSON.stringify(snapshot)
    const first = buildLegacyConversionReport(snapshot)
    assert.deepEqual(buildLegacyConversionReport(snapshot), first)
    assert.equal(JSON.stringify(snapshot), before)
    assert.equal(first.entries[0].status, "conversion_review_required")
    first.entries[0].commitmentIds.pop()
    assert.equal(JSON.stringify(snapshot), before)
  })

  test("output omits financial fields and free-form metadata and is order-independent", () => {
    const secret = "PRIVATE SUPPLIER NAME AND AMOUNT"
    const snapshot = {
      userId,
      candidates: [{ ...candidate(), name: secret, typicalAmountCents: 987654 }],
      commitments: [{ ...commitment(), supplierName: secret, amountCents: 987654, archivedAt: new Date(0) }],
      events: [event(undefined, { metadata: { sourceCandidateId: "candidate-a", supplier: secret, amount: 987654 } })],
    }
    const result = buildLegacyConversionReport(snapshot)
    assert.equal(result.entries[0].status, "ready_to_link")
    assert.ok(!JSON.stringify(result).includes(secret))
    assert.ok(!JSON.stringify(result).includes("987654"))
    const multi = {
      ...snapshot,
      candidates: [candidate(), candidate("candidate-b")],
      commitments: [commitment(), commitment("commitment-b")],
      events: [event(), event("event-b", { commitmentId: "commitment-b", metadata: { sourceCandidateId: "candidate-b" } })],
    }
    assert.deepEqual(buildLegacyConversionReport(multi), buildLegacyConversionReport({
      ...multi,
      candidates: [...multi.candidates].reverse(),
      commitments: [...multi.commitments].reverse(),
      events: [...multi.events].reverse(),
    }))
  })
})