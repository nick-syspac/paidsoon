import "server-only"

import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  InternalServerError,
  RateLimitError,
  TypeSafeClient,
  choice,
} from "@typesafe-ai/sdk"

export const JEV_MODEL = "jev-1.13.0"
export const JEV_MAX_CHOICE_OPTIONS = 255

export type JevCategoryOption = {
  id: string
  name: string
  description?: string | null
}

export type JevClassification = {
  categoryId: string
  confidence: number
  probabilities: Record<string, number>
  model: string
  usage: { inputTokens: number; outputTokens: number }
}

export type JevFailureCode =
  | "timeout"
  | "network"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_error"
  | "invalid_response"

export class JevClassificationError extends Error {
  constructor(
    public readonly code: JevFailureCode,
    public readonly retryAfterMs?: number,
    public readonly status?: number,
  ) {
    super(code)
    this.name = "JevClassificationError"
  }
}

export type JevSdkClient = Pick<TypeSafeClient, "systemOne">

export type JevSpendState = {
  description?: string
  merchant?: string
  direction: "outflow" | "inflow" | "unknown"
  currency?: string
}

function createJevClient(): TypeSafeClient {
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey?.trim()) throw new JevClassificationError("provider_error")

  return new TypeSafeClient({
    apiKey,
    defaultModel: JEV_MODEL,
    // The durable worker owns bounded retries so each attempt is observable.
    retry: { maxRetries: 0 },
    timeout: 10_000,
    logLevel: "off",
  })
}

function mapProviderError(error: unknown): JevClassificationError {
  if (error instanceof JevClassificationError) return error
  const errorRecord = typeof error === "object" && error !== null ? error as Record<string, unknown> : null
  const errorName = error instanceof Error
    ? error.constructor.name
    : typeof errorRecord?.name === "string"
      ? errorRecord.name
      : ""
  const status = typeof errorRecord?.status === "number" ? errorRecord.status : undefined

  if (error instanceof APITimeoutError || errorName === "APITimeoutError") {
    return new JevClassificationError("timeout")
  }
  if (error instanceof APIConnectionError || errorName === "APIConnectionError") {
    return new JevClassificationError("network")
  }
  if (error instanceof RateLimitError || errorName === "RateLimitError" || status === 429) {
    const retryAfterMs = typeof errorRecord?.retryAfterMs === "number" ? errorRecord.retryAfterMs : undefined
    return new JevClassificationError("rate_limited", retryAfterMs, status)
  }
  if ((error instanceof InternalServerError || errorName === "InternalServerError") && status === 529) {
    return new JevClassificationError("provider_unavailable", undefined, status)
  }
  if (error instanceof APIError || status !== undefined) {
    return new JevClassificationError("provider_error", undefined, status)
  }
  return new JevClassificationError("provider_error")
}

function validateCandidates(categories: JevCategoryOption[]): Set<string> {
  const categoryIds = categories.map(({ id }) => id)
  if (
    categories.length === 0 ||
    categories.length > JEV_MAX_CHOICE_OPTIONS ||
    categoryIds.some((id) => !id.trim()) ||
    new Set(categoryIds).size !== categoryIds.length
  ) {
    throw new JevClassificationError("invalid_response")
  }
  return new Set(categoryIds)
}

function validateState(state: JevSpendState): void {
  const allowedKeys = new Set(["description", "merchant", "direction", "currency"])
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new JevClassificationError("invalid_response")
  }
  const entries = Object.entries(state)
  if (
    entries.some(([key, value]) => !allowedKeys.has(key) || typeof value !== "string") ||
    !["outflow", "inflow", "unknown"].includes(state.direction)
  ) {
    throw new JevClassificationError("invalid_response")
  }
}

function validateAnswer(
  answer: {
    type: string
    choice: string
    confidence: number
    probabilities: Record<string, number>
  },
  categoryIds: Set<string>,
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): JevClassification {
  const probabilityEntries = Object.entries(answer.probabilities)
  const probabilitiesAreValid = probabilityEntries.every(
    ([categoryId, probability]) =>
      categoryIds.has(categoryId) && Number.isFinite(probability) && probability >= 0 && probability <= 1,
  )
  const confidenceIsValid = Number.isFinite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1

  if (
    answer.type !== "choice" ||
    !categoryIds.has(answer.choice) ||
    !probabilitiesAreValid ||
    !confidenceIsValid ||
    !Number.isFinite(usage.input_tokens) ||
    !Number.isFinite(usage.output_tokens)
  ) {
    throw new JevClassificationError("invalid_response")
  }

  return {
    categoryId: answer.choice,
    confidence: answer.confidence,
    probabilities: Object.fromEntries(probabilityEntries),
    model,
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
  }
}

export async function classifySpendWithJev(
  state: JevSpendState,
  categories: JevCategoryOption[],
  client?: JevSdkClient,
): Promise<JevClassification> {
  validateState(state)
  const categoryIds = validateCandidates(categories)
  const criteria: Record<string, string | null> = Object.fromEntries(
    categories.map(({ id, name, description }) => [
      id,
      description?.trim() ? `${name}: ${description.trim()}` : name,
    ]),
  )

  try {
    const result = await (client ?? createJevClient()).systemOne({
      model: JEV_MODEL,
      state,
      questions: {
        category: choice("Which single spending category best fits this transaction?", criteria),
      },
    })
    return validateAnswer(result.answers.category, categoryIds, result.model, result.usage)
  } catch (error) {
    throw mapProviderError(error)
  }
}