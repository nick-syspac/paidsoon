import { createHash } from "node:crypto"

import { withUserContext } from "@/lib/db/withUserContext"
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
}

interface CandidateSignal {
  source: CommitmentSource
  supplierKey: string
  supplierName: string
  supplierId: string | null
  category: string
  currency: string
  amountCents: number
  date: Date
}

const MIN_DEFAULT_OCCURRENCES = 3
const MIN_INTERVAL_DAYS = 2

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid] ?? 0
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function classifyFrequencyFromInterval(avgIntervalDays: number): CommitmentFrequency {
  if (avgIntervalDays >= 6 && avgIntervalDays <= 8) return "weekly"
  if (avgIntervalDays >= 13 && avgIntervalDays <= 15) return "fortnightly"
  if (avgIntervalDays >= 28 && avgIntervalDays <= 32) return "monthly"
  if (avgIntervalDays >= 85 && avgIntervalDays <= 95) return "quarterly"
  if (avgIntervalDays >= 175 && avgIntervalDays <= 190) return "six_monthly"
  if (avgIntervalDays >= 350 && avgIntervalDays <= 380) return "annual"
  return "custom"
}

function confidenceFromScore(score: number): CommitmentConfidence {
  if (score >= 0.92) return "high"
  if (score >= 0.75) return "medium"
  return "low"
}

function confidenceRank(value: CommitmentConfidence): number {
  if (value === "confirmed") return 4
  if (value === "high") return 3
  if (value === "medium") return 2
  return 1
}

function buildEvidenceFingerprint(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

function hasMaterialEvidenceChange(input: {
  previousTypicalAmountCents: number
  nextTypicalAmountCents: number
  previousSampleCount: number
  nextSampleCount: number
  previousFingerprint: string | null
  nextFingerprint: string
}): boolean {
  if (input.previousFingerprint !== input.nextFingerprint) {
    const amountDelta = Math.abs(input.nextTypicalAmountCents - input.previousTypicalAmountCents)
    const amountThreshold = Math.max(500, Math.round(input.previousTypicalAmountCents * 0.15))
    const sampleDelta = input.nextSampleCount - input.previousSampleCount
    return amountDelta >= amountThreshold || sampleDelta >= 2
  }

  return false
}

function toSignals(input: {
  bills: Array<{
    supplierName: string
    sourceContactId: string | null
    amountCents: number
    currency: string
    dueDate: Date | null
    paidDate: Date | null
    sourceUpdatedAt: Date | null
    createdAt: Date
  }>
  bankTransactions: Array<{
    counterpartyName: string | null
    sourceContactId: string | null
    amountCents: number
    currency: string
    transactionDate: Date
  }>
}): CandidateSignal[] {
  const signals: CandidateSignal[] = []

  for (const bill of input.bills) {
    const supplierName = bill.supplierName.trim()
    if (!supplierName) continue
    const amountCents = Math.abs(bill.amountCents)
    if (amountCents <= 0) continue

    signals.push({
      source: "accounting_integration",
      supplierKey: `${normalizeText(supplierName)}:${bill.currency.toLowerCase()}`,
      supplierName,
      supplierId: bill.sourceContactId,
      category: "supplier_agreements",
      currency: bill.currency.toLowerCase(),
      amountCents,
      date: bill.dueDate ?? bill.paidDate ?? bill.sourceUpdatedAt ?? bill.createdAt,
    })
  }

  for (const transaction of input.bankTransactions) {
    const supplierName = (transaction.counterpartyName ?? "").trim()
    if (!supplierName) continue
    const amountCents = Math.abs(transaction.amountCents)
    if (amountCents <= 0) continue

    signals.push({
      source: "bank_transaction_pattern",
      supplierKey: `${normalizeText(supplierName)}:${transaction.currency.toLowerCase()}`,
      supplierName,
      supplierId: transaction.sourceContactId,
      category: "other",
      currency: transaction.currency.toLowerCase(),
      amountCents,
      date: transaction.transactionDate,
    })
  }

  return signals
}

function nextDueDateFromFrequency(frequency: CommitmentFrequency, now: Date): Date {
  const next = new Date(now)
  switch (frequency) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7)
      return next
    case "fortnightly":
      next.setUTCDate(next.getUTCDate() + 14)
      return next
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1)
      return next
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3)
      return next
    case "six_monthly":
      next.setUTCMonth(next.getUTCMonth() + 6)
      return next
    case "annual":
      next.setUTCFullYear(next.getUTCFullYear() + 1)
      return next
    case "custom":
    case "one_off":
    default:
      next.setUTCDate(next.getUTCDate() + 30)
      return next
  }
}

export async function detectCommitmentCandidates(userId: string): Promise<DetectCommitmentCandidatesResult> {
  await requireCommitGuardCoreAccess(userId)
  await requireCommitGuardDetectionAccess(userId)
  const entitlements = await getCommitGuardEntitlements(userId)

  return withUserContext(userId, async (tx) => {
    const now = new Date()

    const [settings, bills, bankTransactions] = await Promise.all([
      tx.commitGuardSetting.findUnique({
        where: { userId },
        select: {
          detectionMinOccurrences: true,
          detectionAmountVariancePercent: true,
          detectionIntervalToleranceDays: true,
          detectionConfidenceThreshold: true,
        },
      }),
      tx.importedBill.findMany({
        where: { userId },
        select: {
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
        where: { userId },
        select: {
          counterpartyName: true,
          sourceContactId: true,
          amountCents: true,
          currency: true,
          transactionDate: true,
        },
      }),
    ])

    const minOccurrences = Math.max(
      MIN_DEFAULT_OCCURRENCES,
      settings?.detectionMinOccurrences ?? MIN_DEFAULT_OCCURRENCES,
    )
    const amountVariancePercent = Math.max(1, settings?.detectionAmountVariancePercent ?? 12)
    const intervalTolerance = Math.max(1, settings?.detectionIntervalToleranceDays ?? 3)
    const thresholdConfidence = normalizeCommitmentConfidence(settings?.detectionConfidenceThreshold)

    const signals = toSignals({ bills, bankTransactions })
    const grouped = new Map<string, CandidateSignal[]>()

    for (const signal of signals) {
      const group = grouped.get(signal.supplierKey) ?? []
      group.push(signal)
      grouped.set(signal.supplierKey, group)
    }

    let created = 0
    let updated = 0
    let skipped = 0
    let processed = 0

    for (const groupSignals of grouped.values()) {
      if (processed >= entitlements.detectionCandidatesPerCycleLimit) {
        break
      }

      if (groupSignals.length < minOccurrences) {
        skipped += 1
        continue
      }

      const sorted = [...groupSignals].sort((a, b) => a.date.getTime() - b.date.getTime())
      const amounts = sorted.map((item) => item.amountCents)
      const dates = sorted.map((item) => item.date)
      const intervals: number[] = []

      for (let index = 1; index < dates.length; index += 1) {
        const diffMs = dates[index].getTime() - dates[index - 1].getTime()
        const days = Math.round(diffMs / (24 * 60 * 60 * 1000))
        if (days >= MIN_INTERVAL_DAYS) intervals.push(days)
      }

      if (intervals.length < minOccurrences - 1) {
        skipped += 1
        continue
      }

      const averageIntervalDays = average(intervals)
      const medianAmount = Math.max(0, Math.round(median(amounts)))
      const maxAmount = Math.max(...amounts)
      const minAmount = Math.min(...amounts)
      const spreadPercent =
        medianAmount <= 0 ? 100 : ((maxAmount - minAmount) / Math.max(1, medianAmount)) * 100

      if (spreadPercent > amountVariancePercent) {
        skipped += 1
        continue
      }

      const intervalDeltas = intervals.map((value) => Math.abs(value - averageIntervalDays))
      const intervalVariance = average(intervalDeltas)
      const intervalScore = Math.max(0, 1 - intervalVariance / Math.max(1, intervalTolerance * 2))
      const volumeScore = Math.min(1, sorted.length / (minOccurrences + 3))
      const amountScore = Math.max(0, 1 - spreadPercent / Math.max(1, amountVariancePercent))
      const score = Number((intervalScore * 0.45 + volumeScore * 0.3 + amountScore * 0.25).toFixed(4))

      const confidence = confidenceFromScore(score)
      if (confidenceRank(confidence) < confidenceRank(thresholdConfidence)) {
        skipped += 1
        continue
      }

      const frequency = classifyFrequencyFromInterval(averageIntervalDays)
      const latestSignal = sorted[sorted.length - 1]
      const evidence = {
        supplierKey: latestSignal.supplierKey,
        sampleCount: sorted.length,
        averageIntervalDays,
        spreadPercent,
        intervalVariance,
        minAmount,
        maxAmount,
        medianAmount,
      }
      const evidenceFingerprint = buildEvidenceFingerprint(evidence)

      const existing = await tx.commitmentDetectionCandidate.findFirst({
        where: {
          userId,
          supplierName: latestSignal.supplierName,
          currency: latestSignal.currency,
          frequency,
        },
        orderBy: { createdAt: "desc" },
      })

      if (!existing) {
        const candidate = await tx.commitmentDetectionCandidate.create({
          data: {
            userId,
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

      if (
        existing.status === "not_a_commitment" &&
        existing.rejectionEvidenceFingerprint === evidenceFingerprint
      ) {
        skipped += 1
        continue
      }

      const materialChange = hasMaterialEvidenceChange({
        previousTypicalAmountCents: existing.typicalAmountCents,
        nextTypicalAmountCents: medianAmount,
        previousSampleCount:
          typeof existing.evidence === "object" &&
          existing.evidence !== null &&
          "sampleCount" in existing.evidence &&
          typeof (existing.evidence as { sampleCount?: unknown }).sampleCount === "number"
            ? Number((existing.evidence as { sampleCount?: number }).sampleCount)
            : 0,
        nextSampleCount: sorted.length,
        previousFingerprint: existing.evidenceFingerprint,
        nextFingerprint: evidenceFingerprint,
      })

      if (existing.status === "not_a_commitment" && !materialChange) {
        skipped += 1
        continue
      }

      const updatedCandidate = await tx.commitmentDetectionCandidate.update({
        where: { id: existing.id },
        data: {
          name: latestSignal.supplierName,
          supplierName: latestSignal.supplierName,
          supplierId: latestSignal.supplierId,
          category: latestSignal.category,
          frequency,
          typicalAmountCents: medianAmount,
          source: latestSignal.source,
          confidence,
          confidenceScore: score,
          evidence: evidence as never,
          evidenceFingerprint,
          lastDetectedAt: latestSignal.date,
          nextSuggestedAt: materialChange ? now : existing.nextSuggestedAt,
          status: existing.status === "not_a_commitment" ? "pending" : existing.status,
        },
      })

      const dedupeKey = buildCommitGuardEventDedupeKey({
        eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED,
        detectionCandidateId: updatedCandidate.id,
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

    return { created, updated, skipped }
  })
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
      evidence: row.evidence,
      lastDetectedAt: row.lastDetectedAt,
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
  }>
}): Promise<{ status: "updated" | "not_found"; commitmentId?: string | null }> {
  await requireCommitGuardCoreAccess(input.userId)
  await requireCommitGuardDetectionAccess(input.userId)

  return withUserContext(input.userId, async (tx) => {
    const candidate = await tx.commitmentDetectionCandidate.findFirst({
      where: { id: input.candidateId, userId: input.userId },
    })

    if (!candidate) return { status: "not_found" }

    if (input.action === "edit") {
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
      await tx.commitmentDetectionCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "ignored",
          nextSuggestedAt: null,
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
      await tx.commitmentDetectionCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "not_a_commitment",
          rejectionEvidenceFingerprint: candidate.evidenceFingerprint,
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

    const commitment = await tx.commitment.create({
      data: {
        userId: input.userId,
        name: candidate.name,
        category: candidate.category,
        amountCents: candidate.typicalAmountCents,
        currency: candidate.currency,
        frequency: normalizeCommitmentFrequency(candidate.frequency),
        nextDueDate: nextDueDateFromFrequency(
          normalizeCommitmentFrequency(candidate.frequency),
          new Date(),
        ),
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

    await tx.commitmentEvent.createMany({
      data: [
        {
          userId: input.userId,
          detectionCandidateId: candidate.id,
          commitmentId: commitment.id,
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_DETECTED_CONFIRMED,
          severity: "info",
          actorId: input.actorId ?? null,
          title: "Detected commitment confirmed",
          message: `${candidate.name} was confirmed and converted to a commitment.`,
        },
        {
          userId: input.userId,
          commitmentId: commitment.id,
          eventType: COMMIT_GUARD_EVENT_TYPES.COMMITMENT_CREATED_FROM_DETECTION,
          severity: "info",
          actorId: input.actorId ?? null,
          title: "Commitment created",
          message: `${commitment.name} was created from detection evidence.`,
          metadata: {
            sourceCandidateId: candidate.id,
            confidenceScore: candidate.confidenceScore,
          } as never,
        },
      ],
    })

    return { status: "updated", commitmentId: commitment.id }
  })
}
