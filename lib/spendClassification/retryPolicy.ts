import type { JevFailureCode } from "@/lib/spendClassification/jevClient"

export const JEV_MAX_ATTEMPTS = 3
export const JEV_RETRY_BASE_DELAY_MS = 2_000
export const JEV_RETRY_MULTIPLIER = 4

export type JevFailure = {
  code: JevFailureCode
  retryAfterMs?: number
}

export type JevFailureDecision =
  | { status: "retry"; attemptCount: number; nextAttemptAt: Date; errorCode: JevFailureCode }
  | { status: "needs_review"; attemptCount: number; errorCode: JevFailureCode }

const RETRYABLE_FAILURES = new Set<JevFailureCode>([
  "timeout",
  "network",
  "rate_limited",
  "provider_unavailable",
])

const VALID_FAILURES = new Set<JevFailureCode>([
  ...RETRYABLE_FAILURES,
  "provider_error",
  "invalid_response",
])

/** Maps provider exceptions to safe persisted codes without retaining error text. */
export function toSafeJevFailure(error: unknown): JevFailure {
  const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : null
  const code = typeof record?.code === "string" && VALID_FAILURES.has(record.code as JevFailureCode)
    ? record.code as JevFailureCode
    : "provider_error"
  const retryAfterMs = typeof record?.retryAfterMs === "number" &&
    Number.isFinite(record.retryAfterMs) && record.retryAfterMs >= 0
    ? record.retryAfterMs
    : undefined
  return { code, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) }
}

/** Existing attemptCount is the number of failures persisted before this result. */
export function decideJevFailure(options: {
  attemptCount: number
  failure: JevFailure
  now?: Date
}): JevFailureDecision {
  const attemptCount = options.attemptCount + 1
  const errorCode = options.failure.code
  if (!RETRYABLE_FAILURES.has(errorCode) || attemptCount >= JEV_MAX_ATTEMPTS) {
    return { status: "needs_review", attemptCount, errorCode }
  }

  const backoffMs = JEV_RETRY_BASE_DELAY_MS * JEV_RETRY_MULTIPLIER ** (attemptCount - 1)
  const delayMs = Math.max(backoffMs, options.failure.retryAfterMs ?? 0)
  return {
    status: "retry",
    attemptCount,
    nextAttemptAt: new Date((options.now ?? new Date()).getTime() + delayMs),
    errorCode,
  }
}
