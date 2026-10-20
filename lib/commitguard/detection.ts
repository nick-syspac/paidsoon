import { createHash } from "node:crypto"
import { z } from "zod"
import { validateCommitmentScheduleWrite } from "@/lib/commitguard/commitmentSchedule"
import { buildLegacyConversionReport } from "@/lib/commitguard/legacyConversionReport"
import type { CandidateReviewResult } from "@/lib/commitguard/candidateReview"
import { CandidatePatchSchema, safeCandidateEvidence } from "@/lib/commitguard/candidatePresentation"
import { getEffectiveAccess } from "@/lib/billing/effectiveAccessLoader"
import type { EffectiveAccess } from "@/lib/billing/effectiveAccess"
import { financialJobAccessSkip } from "@/lib/billing/financialJobAccess"
import { getCommitmentDetectionCandidateLimitForTier } from "@/lib/billing"
import { CommitGuardDetectionPolicySchema } from "@/lib/commitguard/settingsSchema"
import { CommitGuardDetectionError } from "@/lib/commitguard/detectionError"
import { inferScopedCommitmentCandidates } from "@/lib/commitguard/detectionEngine"
import { buildDetectionSignals } from "@/lib/commitguard/detectionEvidence"
import { canReactivate, confirmationDueDate, evidenceObject, inferredCandidateIdentity,
  legacyCandidateIdentity, observedSchedule, suppressionBaseline } from "@/lib/commitguard/candidateEvidence"

import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { lockCommitGuardTenant } from "@/lib/commitguard/tenantLock"
import { requestCommitGuardEvaluation } from "@/lib/commitguard/evaluationRequest"
import {
  getCommitGuardEntitlements,
  requireCommitGuardCoreAccess,
  requireCommitGuardDetectionAccess,
} from "@/lib/commitguard/entitlements"
import {
  COMMIT_GUARD_EVENT_TYPES,
  buildCommitGuardEventDedupeKey,
} from "@/lib/commitguard/events"
import {
  normalizeCommitmentConfidence,
  normalizeCommitmentFrequency,
  normalizeCommitmentSource,
  type CommitmentConfidence,
  type CommitmentFrequency,
  type CommitmentSource,
} from "@/lib/commitguard/types"

export interface DetectCommitmentCandidatesResult {
  created: number
  updated: number
  skipped: number
  warnings?: string[]
}

function buildEvidenceFingerprint(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

async function requireDetectionExecutionAccess(userId: string): Promise<EffectiveAccess> {
  // Share the central job policy, but not its system-only admin loader: this
  // service is also called by authenticated customer routes.
  const access = await getEffectiveAccess(userId)
  if (financialJobAccessSkip(access, "commitguard_core") ||
    financialJobAccessSkip(access, "commitguard_detection")) {
    throw new CommitGuardDetectionError("access_denied")
  }
  return access
}

export async function detectCommitmentCandidates(userId: string, now = new Date()): Promise<DetectCommitmentCandidatesResult> {
  // Reject denied admission without opening a financial transaction. Admission
  // alone is not execution authority: refresh it again after the lock wait.
  await requireDetectionExecutionAccess(userId)
  return withUserContext(userId, async (tx) => {
    // Serialize settings reads/evidence/writes with existing policy mutations.
    // This is NOT the D7 work lease/revision/fence protocol (task 6.1).
    await lockCommitGuardTenant(tx, userId)
    return detectCommitmentCandidatesInTransaction(tx, userId, () => requireDetectionExecutionAccess(userId), now)
  })
}

/** Caller owns the tenant lock and execution authority. Jobs MUST call this
 * inside withCommitGuardWorkSideEffects, never the independent user service. */
export async function detectCommitmentCandidatesInTransaction(
  tx: PrismaTx, userId: string, executionAccess: EffectiveAccess | (() => Promise<EffectiveAccess>), now: Date,
): Promise<DetectCommitmentCandidatesResult> {
    const settings = await tx.commitGuardSetting.findUnique({
      where: { userId },
      select: {
        enabled: true,
        detectRecurringCommitments: true,
        detectionMinOccurrences: true,
        detectionAmountVariancePercent: true,
        detectionIntervalToleranceDays: true,
        detectionConfidenceThreshold: true,
      },
    })
    const access = typeof executionAccess === "function" ? await executionAccess() : executionAccess
    if (financialJobAccessSkip(access, "commitguard_core") ||
      financialJobAccessSkip(access, "commitguard_detection")) {
      throw new CommitGuardDetectionError("access_denied")
    }
    if (!settings) throw new CommitGuardDetectionError("settings_required")
    if (!settings.enabled) throw new CommitGuardDetectionError("module_disabled")
    if (!settings.detectRecurringCommitments) throw new CommitGuardDetectionError("detection_disabled")
    const parsedPolicy = CommitGuardDetectionPolicySchema.safeParse({
      detectionMinOccurrences: settings.detectionMinOccurrences,
      detectionAmountVariancePercent: settings.detectionAmountVariancePercent,
      detectionIntervalToleranceDays: settings.detectionIntervalToleranceDays,
      detectionConfidenceThreshold: settings.detectionConfidenceThreshold,
    })
    if (!parsedPolicy.success) throw new CommitGuardDetectionError("invalid_detection_settings")
    const policy = parsedPolicy.data
    const candidateLimit = getCommitmentDetectionCandidateLimitForTier(access.effectiveTier)
    const [bills, bankTransactions] = await Promise.all([
      tx.importedBill.findMany({
        where: { userId, accountingConnection: { userId },
          status: { notIn: ["void", "voided", "cancelled", "canceled", "deleted"] } },
        select: {
          accountingConnectionId: true,
          accountingConnection: { select: { provider: true } },
          sourceId: true,
          supplierReference: true,
          documentNumber: true,
          status: true,
          supplierName: true,
          sourceContactId: true,
          amountCents: true,
          currency: true,
          dueDate: true,
          paidDate: true,
          sourceUpdatedAt: true,
          createdAt: true,
        },
      }),
      tx.importedBankTransaction.findMany({
        where: { userId, accountingConnection: { userId }, direction: "outflow", amountCents: { not: 0 } },
        select: {
          accountingConnectionId: true,
          accountingConnection: { select: { provider: true } },
          sourceId: true,
          direction: true,
          reference: true,
          rawSourceData: true,
          counterpartyName: true,
          sourceContactId: true,
          amountCents: true,
          currency: true,
          transactionDate: true,
        },
      }),
    ])

    const analysis = inferScopedCommitmentCandidates({
      signals: buildDetectionSignals({ bills, bankTransactions }),
      minOccurrences: policy.detectionMinOccurrences,
      amountVariancePercent: policy.detectionAmountVariancePercent,
      intervalToleranceDays: policy.detectionIntervalToleranceDays,
      confidenceThreshold: policy.detectionConfidenceThreshold,
    })

    let created = 0
    let updated = 0
    let skipped = analysis.skipped
    let processed = 0
    const warnings = new Set(analysis.warnings)
    // Complete tenant snapshot: legacy identity ambiguity must never select the
    // newest row or manufacture another candidate. No backfill is guessed here.
    const legacyRows = await tx.commitmentDetectionCandidate.findMany({ where: { userId, candidateKey: null } })

    for (const inferred of analysis.candidates) {
      if (processed >= candidateLimit) {
        break
      }

      const { sorted, medianAmount, score, confidence, frequency, latestSignal } = inferred
      const candidateKey = inferredCandidateIdentity(inferred)
      if (!candidateKey) { skipped += 1; warnings.add("unsupported_candidate_frequency"); continue }
      const schedule = observedSchedule(inferred, now)
      // Schedule suggestions depend on the clock; they are not new source evidence.
      const evidence = { ...inferred.evidence, inferredFrequency: frequency,
        latestObservedAt: schedule.latestObservedAt.toISOString(), recurrenceAnchor: schedule.recurrenceAnchor.toISOString() }
      const evidenceFingerprint = buildEvidenceFingerprint(evidence)

      const keyed = await tx.commitmentDetectionCandidate.findUnique({
        where: { userId_candidateKey: { userId, candidateKey } },
      })
      const matches = legacyRows.filter((row) => legacyCandidateIdentity(row) === candidateKey)
      const uncertain = legacyRows.some((row) => legacyCandidateIdentity(row) === null &&
        row.currency.trim().toLowerCase() === latestSignal.currency &&
        // Missing scope is ambiguous; a proven different connection is not.
        ((!row.connectionId && !evidenceObject(row.evidence).connectionId) ||
          row.connectionId === latestSignal.connectionId ||
          evidenceObject(row.evidence).connectionId === latestSignal.connectionId) &&
        (evidenceObject(row.evidence).supplierKey === latestSignal.supplierKey ||
          row.supplierId && row.supplierId === latestSignal.supplierId ||
          row.supplierName?.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ===
            latestSignal.supplierName.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()))
      if (matches.length > 1 || (keyed && matches.length) || uncertain) {
        warnings.add("candidate_identity_review_required"); skipped += 1; continue
      }
      const existing = keyed ?? matches[0]

      if (existing) {
        // Do not refresh converted rows (or pending legacy rows with conversion
        // evidence). D5's audit-only reconciliation stays in the review service.
        const [commitments, events, candidates] = await Promise.all([
          tx.commitment.findMany({ where: { userId }, select: { id: true, userId: true, sourceDetectionCandidateId: true } }),
          tx.commitmentEvent.findMany({ where: { userId, eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CREATED_FROM_DETECTION },
            select: { id: true, userId: true, eventType: true, commitmentId: true, detectionCandidateId: true, metadata: true } }),
          tx.commitmentDetectionCandidate.findMany({ where: { userId },
            select: { id: true, userId: true, status: true, conversionReviewRequired: true } }),
        ])
        const conversion = buildLegacyConversionReport({ userId, candidates, commitments, events }).entries
          .find((entry) => entry.candidateId === existing.id)
        if (existing.status === "converted" || existing.status === "confirmed" || existing.conversionReviewRequired || conversion) {
          if (conversion?.status === "conversion_review_required" || existing.conversionReviewRequired) warnings.add("conversion_review_required")
          skipped += 1; continue
        }
      }

      if (!existing) {
        const candidate = await tx.commitmentDetectionCandidate.create({
          data: {
            userId,
            candidateKey,
            connectionId: latestSignal.connectionId,
            ...schedule,
            name: latestSignal.supplierName,
            supplierName: latestSignal.supplierName,
            supplierId: latestSignal.supplierId,
            category: latestSignal.category,
            frequency,
            typicalAmountCents: medianAmount,
            currency: latestSignal.currency,
            source: latestSignal.source,
            confidence,
            confidenceScore: score,
            evidence: evidence as never,
            evidenceFingerprint,
            firstDetectedAt: sorted[0].date,
            lastDetectedAt: latestSignal.date,
            status: "pending",
          },
        })

        const dedupeKey = buildCommitGuardEventDedupeKey({
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED,
          detectionCandidateId: candidate.id,
          fingerprint: evidenceFingerprint,
        })

        if (dedupeKey) {
          await tx.commitmentEvent.upsert({
            where: {
              userId_dedupeKey: {
                userId,
                dedupeKey,
              },
            },
            update: {
              message: `${candidate.name} detection evidence was refreshed.`,
            },
            create: {
              userId,
              detectionCandidateId: candidate.id,
              eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED,
              severity: confidence === "high" ? "watch" : "info",
              dedupeKey,
              title: "Commitment detected",
              message: `${candidate.name} looks like a recurring commitment and is ready for review.`,
              metadata: {
                confidence,
                confidenceScore: score,
                source: latestSignal.source,
              } as never,
            },
          })
        }

        created += 1
        processed += 1
        continue
      }

      const suppressed = existing.status === "not_a_commitment" || existing.status === "ignored"
      if (suppressed && !canReactivate(existing.suppressionEvidence, evidence, medianAmount)) {
        skipped += 1
        continue
      }
      const changed = existing.evidenceFingerprint !== evidenceFingerprint
      const corrections = evidenceObject(existing.userCorrections)
      const corrected = Object.keys(corrections).length > 0
      const reviewRequired = corrected && existing.correctionsEvidenceFingerprint !== evidenceFingerprint

      const updatedCandidate = await tx.commitmentDetectionCandidate.update({
        where: { id: existing.id },
        data: {
          candidateKey,
          connectionId: latestSignal.connectionId,
          latestObservedAt: schedule.latestObservedAt,
          recurrenceAnchor: existing.recurrenceAnchor ?? schedule.recurrenceAnchor,
          suggestedDueDate: typeof corrections.suggestedDueDate === "string" ? existing.suggestedDueDate :
            confirmationDueDate({ ...existing, recurrenceAnchor: existing.recurrenceAnchor ?? schedule.recurrenceAnchor }, now) ?? schedule.suggestedDueDate,
          // Owner values remain authoritative, even when new evidence disagrees.
          ...(!corrected ? { name: latestSignal.supplierName,
            category: latestSignal.category, frequency, typicalAmountCents: medianAmount,
            source: latestSignal.source, confidence } : {}),
          supplierName: latestSignal.supplierName,
          supplierId: latestSignal.supplierId,
          confidenceScore: score,
          evidence: evidence as never,
          evidenceFingerprint,
          lastDetectedAt: latestSignal.date,
          nextSuggestedAt: suppressed || changed ? now : existing.nextSuggestedAt,
          reviewNote: reviewRequired ? "evidence_changed_since_correction" : existing.reviewNote,
          status: suppressed ? "pending" : existing.status,
        },
      })

      const dedupeKey = buildCommitGuardEventDedupeKey({
        eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED,
        detectionCandidateId: updatedCandidate.id,
        fingerprint: evidenceFingerprint,
      })

      if (dedupeKey && changed) {
        await tx.commitmentEvent.upsert({
          where: {
            userId_dedupeKey: {
              userId,
              dedupeKey,
            },
          },
          update: {
            message: `${updatedCandidate.name} detection evidence was refreshed.`,
          },
          create: {
            userId,
            detectionCandidateId: updatedCandidate.id,
            eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED,
            severity: confidence === "high" ? "watch" : "info",
            dedupeKey,
            title: "Commitment detected",
            message: `${updatedCandidate.name} looks like a recurring commitment and is ready for review.`,
            metadata: {
              confidence,
              confidenceScore: score,
              source: latestSignal.source,
            } as never,
          },
        })
      }

      updated += 1
      processed += 1
    }

    return { created, updated, skipped, ...(warnings.size ? { warnings: [...warnings].sort() } : {}) }
}

export async function listDetectedCommitmentCandidates(userId: string): Promise<
  Array<{
    id: string
    name: string
    supplierName: string | null
    category: string
    frequency: CommitmentFrequency
    typicalAmountCents: number
    currency: string
    source: CommitmentSource
    confidence: CommitmentConfidence
    confidenceScore: number
    status: string
    evidence: unknown
    lastDetectedAt: Date
    latestObservedAt: Date | null
    recurrenceAnchor: Date | null
    suggestedDueDate: Date | null
    userCorrections: unknown
    evidenceReviewRequired: boolean
    reviewNote: string | null
    conversionReviewRequired: boolean
  }>
> {
  await requireCommitGuardCoreAccess(userId)
  await requireCommitGuardDetectionAccess(userId)
  const entitlements = await getCommitGuardEntitlements(userId)

  return withUserContext(userId, async (tx) => {
    const rows = await tx.commitmentDetectionCandidate.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { lastDetectedAt: "desc" }],
      take: entitlements.detectionCandidatesPerCycleLimit,
    })

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      supplierName: row.supplierName,
      category: row.category,
      frequency: normalizeCommitmentFrequency(row.frequency),
      typicalAmountCents: row.typicalAmountCents,
      currency: row.currency,
      source: normalizeCommitmentSource(row.source),
      confidence: normalizeCommitmentConfidence(row.confidence),
      confidenceScore: row.confidenceScore,
      status: row.status,
      evidence: safeCandidateEvidence(row.evidence),
      lastDetectedAt: row.lastDetectedAt,
      latestObservedAt: row.latestObservedAt,
      recurrenceAnchor: row.recurrenceAnchor,
      suggestedDueDate: row.suggestedDueDate,
      userCorrections: CandidatePatchSchema.safeParse(row.userCorrections).success
        ? CandidatePatchSchema.parse(row.userCorrections) : {},
      evidenceReviewRequired: Object.keys(evidenceObject(row.userCorrections)).length > 0 &&
        row.correctionsEvidenceFingerprint !== row.evidenceFingerprint,
      reviewNote: row.reviewNote,
      conversionReviewRequired: row.conversionReviewRequired,
    }))
  })
}

export async function reviewDetectedCommitmentCandidate(input: {
  userId: string
  candidateId: string
  action: "confirm" | "ignore" | "not_a_commitment" | "edit"
  actorId?: string | null
  patch?: Partial<{
    name: string
    category: string
    frequency: string
    typicalAmountCents: number
    confidence: string
    source: string
    suggestedDueDate: string
  }>
  now?: Date
}): Promise<CandidateReviewResult> {
  await requireCommitGuardCoreAccess(input.userId)
  await requireCommitGuardDetectionAccess(input.userId)

  if (input.action !== "edit" && input.patch !== undefined) {
    throw new z.ZodError([{ code: "custom", path: ["patch"], message: "Patch is only supported for edit actions" }])
  }
  if (input.patch?.frequency !== undefined) {
    validateCommitmentScheduleWrite({ frequency: input.patch.frequency })
  }
  if (input.patch?.suggestedDueDate !== undefined) z.iso.date().parse(input.patch.suggestedDueDate)
  return withUserContext(input.userId, async (tx) => {
    // All review actions take tenant -> candidate locks so edits/rejections
    // cannot race confirmation and reopen a converted candidate.
    await lockCommitGuardTenant(tx, input.userId)
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.commitment_detection_candidates
      WHERE user_id = ${input.userId} AND id = ${input.candidateId} FOR UPDATE
    `
    if (locked.length === 0) return { status: "not_found" }
    const entitlements = await getCommitGuardEntitlements(input.userId)
    if (!entitlements.hasCoreAccess || !entitlements.hasDetectionAccess) {
      throw new Error("Upgrade required")
    }
    const candidate = await tx.commitmentDetectionCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
    })

    if (!candidate) return { status: "not_found" }

    if (candidate.conversionReviewRequired) {
      return { status: "conflict", reason: "conversion_review_required", reviewReasons: ["existing_review_required"] }
    }
    // Unique tenant-safe link is authoritative for new conversions, including
    // archived originals. A retry must not count slots or validate old schedules.
    const original = await tx.commitment.findUnique({
      where: { userId_sourceDetectionCandidateId: { userId: input.userId, sourceDetectionCandidateId: candidate.id } },
      select: { id: true },
    })
    if (original) {
      return input.action === "confirm"
        ? { status: "updated", commitmentId: original.id }
        : { status: "conflict", reason: "candidate_already_converted", commitmentId: original.id }
    }

    // Legacy status is not proof of conversion identity. Read the complete
    // tenant snapshot (including archived commitments and competing claims),
    // and use only the existing conservative audit reconciliation contract.
    const [candidates, commitments, events] = await Promise.all([
      tx.commitmentDetectionCandidate.findMany({ where: { userId: input.userId },
        select: { id: true, userId: true, status: true, conversionReviewRequired: true } }),
      tx.commitment.findMany({ where: { userId: input.userId },
        select: { id: true, userId: true, sourceDetectionCandidateId: true } }),
      tx.commitmentEvent.findMany({ where: { userId: input.userId, eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CREATED_FROM_DETECTION },
        select: { id: true, userId: true, eventType: true, commitmentId: true, detectionCandidateId: true, metadata: true } }),
    ])
    const legacy = buildLegacyConversionReport({ userId: input.userId, candidates, commitments, events })
      .entries.find((entry) => entry.candidateId === candidate.id)
    if (legacy) {
      if (!legacy.proposedCommitmentId) {
        return { status: "conflict", reason: "conversion_review_required", reviewReasons: legacy.reasons }
      }
      if (input.action !== "confirm") {
        return { status: "conflict", reason: "candidate_already_converted", commitmentId: legacy.proposedCommitmentId }
      }
      // Reconcile only unique audit proof, never create another commitment or
      // conversion event, and never mass-backfill or clear a review flag.
      await tx.commitment.update({
        where: { userId_id: { userId: input.userId, id: legacy.proposedCommitmentId } },
        data: { sourceDetectionCandidateId: candidate.id },
      })
      await tx.commitmentDetectionCandidate.update({ where: { id: candidate.id },
        data: { status: "converted", confidence: "confirmed" } })
      return { status: "updated", commitmentId: legacy.proposedCommitmentId }
    }

    if (input.action === "edit") {
      input = { ...input, patch: CandidatePatchSchema.parse(input.patch) }
      const corrections = { ...evidenceObject(candidate.userCorrections), ...input.patch }
      const suggestedDueDate = confirmationDueDate({ ...candidate, userCorrections: corrections,
        frequency: input.patch?.frequency ?? candidate.frequency }, input.now ?? new Date())
      await tx.commitmentDetectionCandidate.update({
        where: { id: candidate.id },
        data: {
          name: input.patch?.name,
          category: input.patch?.category,
          frequency: input.patch?.frequency
            ? normalizeCommitmentFrequency(input.patch.frequency)
            : undefined,
          typicalAmountCents:
            input.patch?.typicalAmountCents === undefined
              ? undefined
              : Math.max(0, Math.round(input.patch.typicalAmountCents)),
          confidence: input.patch?.confidence
            ? normalizeCommitmentConfidence(input.patch.confidence)
            : undefined,
          source: input.patch?.source ? normalizeCommitmentSource(input.patch.source) : undefined,
          suggestedDueDate: suggestedDueDate ?? undefined,
          userCorrections: corrections,
          correctionsEvidenceFingerprint: candidate.evidenceFingerprint,
          reviewNote: null,
          status: "pending",
        },
      })

      await tx.commitmentEvent.create({
        data: {
          userId: input.userId,
          detectionCandidateId: candidate.id,
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED_EDITED,
          severity: "info",
          actorId: input.actorId ?? null,
          title: "Detected commitment updated",
          message: `${candidate.name} detection details were edited.`,
        },
      })

      return { status: "updated" }
    }

    if (input.action === "ignore") {
      if (candidate.status === "ignored") return { status: "updated" }
      await tx.commitmentDetectionCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "ignored",
          nextSuggestedAt: null,
          suppressionEvidence: suppressionBaseline(candidate),
        },
      })

      await tx.commitmentEvent.create({
        data: {
          userId: input.userId,
          detectionCandidateId: candidate.id,
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED_IGNORED,
          severity: "info",
          actorId: input.actorId ?? null,
          title: "Detected commitment ignored",
          message: `${candidate.name} was ignored.`,
        },
      })

      return { status: "updated" }
    }

    if (input.action === "not_a_commitment") {
      if (candidate.status === "not_a_commitment") return { status: "updated" }
      await tx.commitmentDetectionCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "not_a_commitment",
          rejectionEvidenceFingerprint: candidate.evidenceFingerprint,
          suppressionEvidence: suppressionBaseline(candidate),
          nextSuggestedAt: null,
        },
      })

      await tx.commitmentEvent.create({
        data: {
          userId: input.userId,
          detectionCandidateId: candidate.id,
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED_REJECTED,
          severity: "info",
          actorId: input.actorId ?? null,
          title: "Detected commitment rejected",
          message: `${candidate.name} was marked as not a commitment.`,
        },
      })

      return { status: "updated" }
    }

    // A legacy/inferred custom candidate stays reviewable but cannot create an
    // unsupported commitment. Correct its frequency before confirming it.
    if (candidate.status !== "pending") {
      return { status: "conflict", reason: "invalid_candidate_transition" }
    }
    validateCommitmentScheduleWrite({ frequency: candidate.frequency })
    const dueDate = confirmationDueDate(candidate, input.now ?? new Date())
    if (!dueDate) return { status: "conflict", reason: "candidate_schedule_review_required" }
    // Preserve the manual allowance policy: cancelled but unarchived rows count.
    const currentCount = await tx.commitment.count({ where: { userId: input.userId, archivedAt: null } })
    if (currentCount >= entitlements.commitmentsTrackedLimit) {
      throw new Error("Commitment limit reached")
    }
    const frequency = normalizeCommitmentFrequency(candidate.frequency)
    const commitment = await tx.commitment.create({
      data: {
        userId: input.userId,
        sourceDetectionCandidateId: candidate.id,
        name: candidate.name,
        category: candidate.category,
        amountCents: candidate.typicalAmountCents,
        currency: candidate.currency,
        frequency,
        nextDueDate: dueDate,
        source: normalizeCommitmentSource(candidate.source),
        status: "active",
        confidence: "confirmed",
        supplierName: candidate.supplierName,
        supplierId: candidate.supplierId,
      },
    })

    await tx.commitmentDetectionCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "converted",
        confidence: "confirmed",
      },
    })

    // Only a new conversion changes forecast inputs. Review edits/rejections
    // and unique legacy-link reconciliation above do not create obligations.
    await requestCommitGuardEvaluation(tx, input.userId)
    await tx.commitmentEvent.create({
      data: {
        userId: input.userId,
        commitmentId: commitment.id,
        detectionCandidateId: candidate.id,
        eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CREATED_FROM_DETECTION,
        dedupeKey: `commitguard:conversion:${candidate.id}`,
        severity: "info",
        actorId: input.actorId ?? null,
        title: "Commitment created",
        message: `${commitment.name} was created from detection evidence.`,
        metadata: {
          sourceCandidateId: candidate.id,
          confidenceScore: candidate.confidenceScore,
          transition: { from: candidate.status, to: "converted" },
        },
      },
    })

    return { status: "updated", commitmentId: commitment.id }
  })
}
