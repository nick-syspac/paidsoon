function dateOnlyKey(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const asDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(asDate.getTime())) return null
  return asDate.toISOString().slice(0, 10)
}

export function matchesAccountDisplayDate(
  recordDate: Date | null | undefined,
  cutoffDate: Date | null,
): boolean {
  if (!cutoffDate) return true
  if (!recordDate) return false

  const cutoffKey = dateOnlyKey(cutoffDate)
  const recordKey = dateOnlyKey(recordDate)
  if (!cutoffKey || !recordKey) return false

  return recordKey >= cutoffKey
}

export function depositRequestMatchesAccountCutoff(
  requestDate: Date | null | undefined,
  cutoffDate: Date | null,
): boolean {
  return matchesAccountDisplayDate(requestDate, cutoffDate)
}

export function jobMatchesAccountCutoff(
  job: { expectedStartDate?: Date | null; expectedCompletionDate?: Date | null },
  cutoffDate: Date | null,
): boolean {
  const candidateDate = job.expectedStartDate ?? job.expectedCompletionDate ?? null
  return matchesAccountDisplayDate(candidateDate, cutoffDate)
}

export function milestoneMatchesAccountCutoff(
  milestone: { targetDate?: Date | null },
  cutoffDate: Date | null,
): boolean {
  return matchesAccountDisplayDate(milestone.targetDate ?? null, cutoffDate)
}

export function paymentMatchesAccountCutoff(
  payment: { paidAt?: Date | null; createdAt?: Date | null },
  cutoffDate: Date | null,
): boolean {
  return matchesAccountDisplayDate(payment.paidAt ?? payment.createdAt ?? null, cutoffDate)
}
