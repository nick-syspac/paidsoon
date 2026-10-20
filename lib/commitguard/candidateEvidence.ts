import { createHash } from "node:crypto"
import { z } from "zod"
import { nextCommitmentOccurrence } from "@/lib/commitguard/engine"
import type { ScopedCommitmentCandidate } from "@/lib/commitguard/detectionEngine"
import { classifyFrequencyFromInterval } from "@/lib/commitguard/detectionEngine"
import type { CommitmentFrequency } from "@/lib/commitguard/types"

export function evidenceObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

const recurring = z.enum(["weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual"])
export function candidateIdentity(input: {
  connectionId: unknown; supplierKey: unknown; currency: unknown; frequency: unknown
}): string | null {
  if (typeof input.connectionId !== "string" || !input.connectionId.trim() ||
    typeof input.supplierKey !== "string" || !input.supplierKey.trim() ||
    typeof input.currency !== "string" || !input.currency.trim() || !recurring.safeParse(input.frequency).success) return null
  return createHash("sha256").update(JSON.stringify(["v1", input.connectionId,
    input.supplierKey, input.currency.trim().toLowerCase(), input.frequency])).digest("hex")
}

export function inferredCandidateIdentity(candidate: ScopedCommitmentCandidate): string | null {
  return candidateIdentity({ ...candidate.latestSignal, frequency: candidate.frequency })
}

export function legacyCandidateIdentity(row: {
  evidence: unknown; connectionId?: string | null; frequency: string; currency: string; userCorrections?: unknown
}): string | null {
  const evidence = evidenceObject(row.evidence)
  // Editable candidate frequency is never proof of the original identity,
  // including legacy edits made before userCorrections existed.
  const frequency = evidence.inferredFrequency ?? (typeof evidence.averageIntervalDays === "number"
    ? classifyFrequencyFromInterval(evidence.averageIntervalDays) : null)
  if (row.connectionId && evidence.connectionId && row.connectionId !== evidence.connectionId) return null
  if (typeof evidence.currency === "string" && evidence.currency.toLowerCase() !== row.currency.toLowerCase()) return null
  return candidateIdentity({ connectionId: row.connectionId ?? evidence.connectionId,
    supplierKey: evidence.supplierKey, currency: row.currency, frequency })
}

export function observationIds(evidence: unknown): string[] {
  const observations = evidenceObject(evidence).observations
  if (!Array.isArray(observations)) return []
  return [...new Set(observations.flatMap((item) => {
    const id = evidenceObject(item).observationId
    return typeof id === "string" && id ? [id] : []
  }))].sort()
}

export function suppressionBaseline(candidate: {
  evidence: unknown; evidenceFingerprint: string | null; typicalAmountCents: number
}): { observationIds: string[]; typicalAmountCents: number; evidenceFingerprint: string | null } {
  const amount = evidenceObject(candidate.evidence).medianAmount
  return { observationIds: observationIds(candidate.evidence),
    typicalAmountCents: typeof amount === "number" && Number.isSafeInteger(amount) && amount >= 0
      ? amount : candidate.typicalAmountCents,
    evidenceFingerprint: candidate.evidenceFingerprint }
}

export function canReactivate(baseline: unknown, evidence: unknown, amount: number): boolean {
  const parsed = z.object({ observationIds: z.array(z.string().min(1)),
    typicalAmountCents: z.number().int().nonnegative() }).safeParse(baseline)
  if (!parsed.success) return false // Missing legacy baseline is not permission to reopen.
  const previous = new Set(parsed.data.observationIds)
  const newSamples = observationIds(evidence).filter((id) => !previous.has(id)).length
  return newSamples >= 2 || Math.abs(amount - parsed.data.typicalAmountCents) >=
    Math.max(500, parsed.data.typicalAmountCents * 0.15)
}

export function observedSchedule(candidate: ScopedCommitmentCandidate, now: Date): {
  latestObservedAt: Date; recurrenceAnchor: Date; suggestedDueDate: Date
} {
  const recurrenceAnchor = new Date(candidate.sorted[0].date)
  recurrenceAnchor.setUTCHours(0, 0, 0, 0)
  const latestObservedAt = new Date(candidate.latestSignal.date)
  latestObservedAt.setUTCHours(0, 0, 0, 0)
  return { recurrenceAnchor, latestObservedAt,
    suggestedDueDate: nextCommitmentOccurrence(recurrenceAnchor, candidate.frequency, now) }
}

export function confirmationDueDate(candidate: {
  suggestedDueDate?: Date | null; recurrenceAnchor?: Date | null; frequency: string; userCorrections?: unknown
}, now: Date): Date | null {
  const explicit = evidenceObject(candidate.userCorrections).suggestedDueDate
  if (typeof explicit === "string" && z.iso.date().safeParse(explicit).success) return new Date(`${explicit}T00:00:00Z`)
  if (candidate.frequency === "one_off") {
    return candidate.suggestedDueDate && Number.isFinite(candidate.suggestedDueDate.getTime())
      ? new Date(candidate.suggestedDueDate) : null
  }
  const frequency = recurring.safeParse(candidate.frequency)
  if (!frequency.success) return null
  // Prefer the original anchor so a clamped February suggestion never drifts March.
  const anchor = candidate.recurrenceAnchor ?? candidate.suggestedDueDate
  return anchor && Number.isFinite(anchor.getTime())
    ? nextCommitmentOccurrence(anchor, frequency.data as CommitmentFrequency, now) : null
}