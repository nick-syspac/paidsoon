import assert from "node:assert/strict"
import { before, mock, test } from "node:test"

import {
  APIConnectionError,
  APITimeoutError,
  InternalServerError,
  RateLimitError,
} from "@typesafe-ai/sdk"

let jevClient: typeof import("@/lib/spendClassification/jevClient")

const categories = [
  { id: "category-software", name: "Software & Cloud", description: "Hosting and applications" },
  { id: "category-other", name: "Other" },
]

before(async () => {
  await mock.module("server-only", { namedExports: {} })
  jevClient = await import("@/lib/spendClassification/jevClient")
})

test("sends a pinned Choice request and validates the selected active category", async () => {
  let capturedRequest: Record<string, unknown> | undefined
  const client = {
    systemOne: async (request: Record<string, unknown>) => {
      capturedRequest = request
      return {
        model: "jev-1.13.0",
        answers: {
          category: {
            type: "choice",
            choice: "category-software",
            confidence: 0.91,
            probabilities: { "category-software": 0.91, "category-other": 0.09 },
          },
        },
        usage: { input_tokens: 21, output_tokens: 6 },
      }
    },
  }

  const result = await jevClient.classifySpendWithJev(
    { description: "monthly hosting service", direction: "outflow" },
    categories,
    client as never,
  )

  assert.equal(capturedRequest?.model, "jev-1.13.0")
  const categoryQuestion = (capturedRequest?.questions as { category?: Record<string, unknown> } | undefined)?.category
  assert.ok(categoryQuestion)
  assert.deepEqual(Object.keys(categoryQuestion), [
    "type",
    "instructions",
    "criteria",
  ])
  const criteria = categoryQuestion.criteria as Record<string, string> | undefined
  assert.ok(criteria)
  assert.deepEqual(Object.keys(criteria), ["category-software", "category-other"])
  assert.deepEqual(result, {
    categoryId: "category-software",
    confidence: 0.91,
    probabilities: { "category-software": 0.91, "category-other": 0.09 },
    model: "jev-1.13.0",
    usage: { inputTokens: 21, outputTokens: 6 },
  })
})

test("rejects Choice answers outside the exact submitted candidate set", async () => {
  const client = {
    systemOne: async () => ({
      model: "jev-1.13.0",
      answers: {
        category: {
          type: "choice",
          choice: "not-submitted",
          confidence: 1,
          probabilities: { "category-software": 1 },
        },
      },
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  }

  await assert.rejects(
    jevClient.classifySpendWithJev({ description: "state", direction: "unknown" }, categories, client as never),
    (error: unknown) => error instanceof jevClient.JevClassificationError && error.code === "invalid_response",
  )
})

test("rejects duplicate, empty, and over-limit Choice candidate lists", async () => {
  const client = { systemOne: async () => { throw new Error("request must not be sent") } }
  const duplicate = [categories[0], { ...categories[1], id: categories[0].id }]
  const tooMany = Array.from({ length: 256 }, (_, index) => ({ id: `category-${index}`, name: `Category ${index}` }))

  for (const invalid of [[], duplicate, tooMany]) {
    await assert.rejects(
      jevClient.classifySpendWithJev({ description: "state", direction: "unknown" }, invalid, client as never),
      (error: unknown) => error instanceof jevClient.JevClassificationError && error.code === "invalid_response",
    )
  }
})

test("maps timeout, network, 429 Retry-After, and 529 errors without calling a live provider", async () => {
  const cases: Array<{ error: Error; code: string; retryAfterMs?: number; status?: number }> = [
    { error: new APITimeoutError(10), code: "timeout" },
    { error: new APIConnectionError("connection failed"), code: "network" },
    {
      error: new RateLimitError(429, {}, new Headers({ "retry-after": "2" })),
      code: "rate_limited",
      retryAfterMs: 2000,
      status: 429,
    },
    {
      error: new InternalServerError(529, {}, new Headers()),
      code: "provider_unavailable",
      status: 529,
    },
  ]

  for (const expected of cases) {
    const client = { systemOne: async () => { throw expected.error } }
    await assert.rejects(
      jevClient.classifySpendWithJev({ description: "state", direction: "unknown" }, categories, client as never),
      (error: unknown) => {
        assert.ok(error instanceof jevClient.JevClassificationError)
        assert.equal(error.code, expected.code)
        assert.equal(error.retryAfterMs, expected.retryAfterMs)
        assert.equal(error.status, expected.status)
        return true
      },
    )
  }
})

test("rejects request state containing fields outside the minimized allowlist", async () => {
  const client = { systemOne: async () => { throw new Error("request must not be sent") } }
  const unsafeState = {
    description: "hosting",
    direction: "outflow",
    amountCents: 4_200,
    sourceRecordId: "source-secret",
  }

  await assert.rejects(
    jevClient.classifySpendWithJev(unsafeState as never, categories, client as never),
    (error: unknown) => error instanceof jevClient.JevClassificationError && error.code === "invalid_response",
  )
})