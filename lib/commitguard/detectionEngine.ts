import { CommitGuardDetectionPolicySchema } from "@/lib/commitguard/settingsSchema"
import type { CommitmentConfidence, CommitmentFrequency, CommitmentSource } from "@/lib/commitguard/types"
import { buildDetectionEvidenceStreams, type DetectionSourceKind, type EconomicReference } from "@/lib/commitguard/detectionEvidence"

export interface CandidateSignal {
  connectionId: string
  provider: string
  sourceKind: DetectionSourceKind
  sourceId: string
  observationId: string
  signedAmountCents: number
  direction: string
  status: string | null
  reference: string | null
  economicReferences: EconomicReference[]
  source: CommitmentSource
  supplierKey: string
  supplierName: string
  supplierId: string | null
  category: string
  currency: string
  amountCents: number
  date: Date
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid] ?? 0
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

export function classifyFrequencyFromInterval(days: number): CommitmentFrequency {
  if (days >= 6 && days <= 8) return "weekly"
  if (days >= 13 && days <= 15) return "fortnightly"
  if (days >= 28 && days <= 32) return "monthly"
  if (days >= 85 && days <= 95) return "quarterly"
  if (days >= 175 && days <= 190) return "six_monthly"
  if (days >= 350 && days <= 380) return "annual"
  return "custom"
}

function confidenceRank(value: CommitmentConfidence): number {
  return value === "confirmed" ? 4 : value === "high" ? 3 : value === "medium" ? 2 : 1
}

export interface InferredCommitmentCandidate {
  sorted: CandidateSignal[]
  latestSignal: CandidateSignal
  medianAmount: number
  score: number
  confidence: "low" | "medium" | "high"
  frequency: CommitmentFrequency
  evidence: {
    supplierKey: string
    sampleCount: number
    averageIntervalDays: number
    spreadPercent: number
    intervalVariance: number
    minAmount: number
    maxAmount: number
    medianAmount: number
  }
}

/** Scores one already-scoped, deduplicated source stream. */
export function inferCommitmentCandidate(input: {
  signals: readonly CandidateSignal[]
  minOccurrences?: number
  amountVariancePercent: number
  intervalToleranceDays: number
  confidenceThreshold: CommitmentConfidence
}): InferredCommitmentCandidate | null {
  const policy = CommitGuardDetectionPolicySchema.parse({
    detectionMinOccurrences: input.minOccurrences === undefined ? 3 : input.minOccurrences,
    detectionAmountVariancePercent: input.amountVariancePercent,
    detectionIntervalToleranceDays: input.intervalToleranceDays,
    detectionConfidenceThreshold: input.confidenceThreshold,
  })
  const minOccurrences = policy.detectionMinOccurrences
  if (input.signals.length < minOccurrences) return null
  const sorted = [...input.signals].sort((a, b) => a.date.getTime() - b.date.getTime())
  const amounts = sorted.map((item) => item.amountCents)
  const intervals: number[] = []
  for (let index = 1; index < sorted.length; index += 1) {
    const days = Math.round((sorted[index].date.getTime() - sorted[index - 1].date.getTime()) / 86_400_000)
    if (days >= 2) intervals.push(days)
  }
  if (intervals.length < minOccurrences - 1) return null
  const averageIntervalDays = average(intervals)
  const medianAmount = Math.max(0, Math.round(median(amounts)))
  const maxAmount = Math.max(...amounts)
  const minAmount = Math.min(...amounts)
  const spreadPercent = medianAmount <= 0 ? 100 : ((maxAmount - minAmount) / Math.max(1, medianAmount)) * 100
  if (spreadPercent > policy.detectionAmountVariancePercent) return null
  const intervalVariance = average(intervals.map((value) => Math.abs(value - averageIntervalDays)))
  const intervalScore = Math.max(0, 1 - intervalVariance / Math.max(1, policy.detectionIntervalToleranceDays * 2))
  const volumeScore = Math.min(1, sorted.length / (minOccurrences + 3))
  const amountScore = Math.max(0, 1 - spreadPercent / Math.max(1, policy.detectionAmountVariancePercent))
  const score = Number((intervalScore * 0.45 + volumeScore * 0.3 + amountScore * 0.25).toFixed(4))
  const confidence = score >= 0.92 ? "high" : score >= 0.75 ? "medium" : "low"
  if (confidenceRank(confidence) < confidenceRank(policy.detectionConfidenceThreshold)) return null
  const latestSignal = sorted[sorted.length - 1]
  return {
    sorted, latestSignal, medianAmount, score, confidence,
    frequency: classifyFrequencyFromInterval(averageIntervalDays),
    evidence: { supplierKey: latestSignal.supplierKey, sampleCount: sorted.length,
      averageIntervalDays, spreadPercent, intervalVariance, minAmount, maxAmount, medianAmount },
  }
}

export type DetectionPolicyInput = Omit<Parameters<typeof inferCommitmentCandidate>[0], "signals">

interface DetectionObservation {
  observationId: string
  connectionId: string
  provider: string
  sourceKind: DetectionSourceKind
  sourceId: string
  date: string
  amountCents: number
  signedAmountCents: number
  currency: string
  direction: string
  status: string | null
  reference: string | null
  economicReferences: EconomicReference[]
}

export interface ScopedCommitmentCandidate extends InferredCommitmentCandidate {
  groupKey: string
  evidence: InferredCommitmentCandidate["evidence"] & {
    connectionId: string
    currency: string
    sourceKind: DetectionSourceKind
    observations: DetectionObservation[]
    excludedObservations: DetectionObservation[]
    warnings: string[]
    alternateStreams: Array<{
      sourceKind: DetectionSourceKind
      qualifying: boolean
      frequency: CommitmentFrequency | null
      sampleCount: number
      observations: DetectionObservation[]
      excludedObservations: DetectionObservation[]
      warnings: string[]
    }>
  }
}

function observation(signal: CandidateSignal): DetectionObservation {
  return { observationId: signal.observationId, connectionId: signal.connectionId,
    provider: signal.provider, sourceKind: signal.sourceKind, sourceId: signal.sourceId,
    date: signal.date.toISOString(), amountCents: signal.amountCents,
    signedAmountCents: signal.signedAmountCents, currency: signal.currency,
    direction: signal.direction, status: signal.status, reference: signal.reference,
    economicReferences: signal.economicReferences }
}

/** Never combine bill and bank counts. Alternative streams are informational,
 * including where no explicit provider relationship proves a bill/payment match.
 */
export function inferScopedCommitmentCandidates(input: DetectionPolicyInput & { signals: readonly CandidateSignal[] }): {
  candidates: ScopedCommitmentCandidate[]
  skipped: number
  warnings: string[]
} {
  const streams = buildDetectionEvidenceStreams(input.signals)
  const scored = streams.map((stream) => ({ stream,
    inferred: inferCommitmentCandidate({ ...input, signals: stream.signals }) }))
  const candidates = scored.flatMap(({ stream, inferred }) => {
    if (!inferred) return []
    const alternatives = scored.filter((other) => other.stream.groupKey === stream.groupKey &&
      other.stream.sourceKind !== stream.sourceKind)
    if (stream.sourceKind === "bank_transaction" && alternatives.some((other) =>
      other.inferred?.frequency === inferred.frequency && other.stream.sourceKind === "bill")) return []
    const warnings = [...new Set([...stream.warnings, ...alternatives.flatMap((other) => other.stream.warnings),
      ...(alternatives.length ? ["potential_duplicate_streams"] : [])])].sort()
    return [{ ...inferred, groupKey: stream.groupKey,
      evidence: { ...inferred.evidence, connectionId: inferred.latestSignal.connectionId,
        currency: inferred.latestSignal.currency, sourceKind: stream.sourceKind,
        observations: inferred.sorted.map(observation),
        excludedObservations: stream.excludedObservations.map(observation), warnings,
        alternateStreams: alternatives.map((other) => ({ sourceKind: other.stream.sourceKind,
          qualifying: other.inferred !== null, frequency: other.inferred?.frequency ?? null,
          sampleCount: other.stream.signals.length, observations: other.stream.signals.map(observation),
          excludedObservations: other.stream.excludedObservations.map(observation), warnings: other.stream.warnings })) } }]
  })
  return { candidates, skipped: scored.filter((item) => !item.inferred).length,
    warnings: [...new Set([...streams.flatMap((stream) => stream.warnings),
      ...(streams.some((stream) => streams.some((other) => other.groupKey === stream.groupKey &&
        other.sourceKind !== stream.sourceKind)) ? ["potential_duplicate_streams"] : []),
      ...candidates.flatMap((candidate) => candidate.evidence.warnings)])].sort() }
}