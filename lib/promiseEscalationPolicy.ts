export const DEFAULT_PROMISE_RETRY_LIMIT = 2
export const DEFAULT_PROMISE_ESCALATION_THRESHOLD = 2

export type PromiseEscalationPolicyConfig = {
  retryLimit: number
  escalationThreshold: number
  timingEscalationEnabled: boolean
  toneEscalationEnabled: boolean
}

type BrokenPromiseCounterInput = {
  userId: string
  clientEmail: string
}

export function promiseDebtorKey(userId: string, clientEmail: string): string {
  return `${userId}:${clientEmail.toLowerCase()}`
}

export function buildBrokenPromiseDebtorCounts(
  rows: BrokenPromiseCounterInput[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = promiseDebtorKey(row.userId, row.clientEmail)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function buildBrokenPromiseCountsByDebtor(
  rows: Array<{ clientEmail: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const key = row.clientEmail.toLowerCase()
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export function resolvePromiseEscalationPolicy(
  input?: Partial<PromiseEscalationPolicyConfig> | null,
): PromiseEscalationPolicyConfig {
  return {
    retryLimit: Math.max(1, input?.retryLimit ?? DEFAULT_PROMISE_RETRY_LIMIT),
    escalationThreshold: Math.max(
      1,
      input?.escalationThreshold ?? DEFAULT_PROMISE_ESCALATION_THRESHOLD,
    ),
    timingEscalationEnabled: Boolean(input?.timingEscalationEnabled),
    toneEscalationEnabled: Boolean(input?.toneEscalationEnabled),
  }
}

export function shouldBlockClientPromise(
  brokenCount: number,
  retryLimit: number,
): boolean {
  return brokenCount >= retryLimit
}

export function isPromiseHighRiskDebtor(
  brokenCount: number,
  escalationThreshold: number,
): boolean {
  return brokenCount >= escalationThreshold
}

export function applyToneEscalationStage(
  baseStage: 1 | 2 | 3,
  brokenCount: number,
  policy: PromiseEscalationPolicyConfig,
): 1 | 2 | 3 {
  if (!policy.toneEscalationEnabled) return baseStage
  if (!isPromiseHighRiskDebtor(brokenCount, policy.escalationThreshold)) return baseStage
  if (baseStage === 3) return 3
  return (baseStage + 1) as 2 | 3
}

export function applyTimingEscalation(
  nextEmailAt: Date,
  brokenCount: number,
  policy: PromiseEscalationPolicyConfig,
): Date {
  if (!policy.timingEscalationEnabled) return nextEmailAt
  if (!isPromiseHighRiskDebtor(brokenCount, policy.escalationThreshold)) return nextEmailAt

  const escalated = new Date(nextEmailAt)
  escalated.setDate(escalated.getDate() - 2)
  return escalated
}
