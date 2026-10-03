import assert from "node:assert/strict"
import { test } from "node:test"

import { decideJevFailure, toSafeJevFailure } from "@/lib/spendClassification/retryPolicy"

const now = new Date("2026-10-03T12:00:00.000Z")

test("uses bounded 2s and 8s durable exponential delays for retryable errors", () => {
  const first = decideJevFailure({ attemptCount: 0, failure: { code: "network" }, now })
  assert.equal(first.status, "retry")
  if (first.status !== "retry") return
  assert.equal(first.attemptCount, 1)
  assert.equal(first.nextAttemptAt.toISOString(), "2026-10-03T12:00:02.000Z")

  const second = decideJevFailure({ attemptCount: 1, failure: { code: "timeout" }, now })
  assert.equal(second.status, "retry")
  if (second.status !== "retry") return
  assert.equal(second.attemptCount, 2)
  assert.equal(second.nextAttemptAt.toISOString(), "2026-10-03T12:00:08.000Z")
})

test("honors Retry-After when it exceeds exponential backoff", () => {
  const result = decideJevFailure({
    attemptCount: 0,
    failure: { code: "rate_limited", retryAfterMs: 60_000 },
    now,
  })
  assert.equal(result.status, "retry")
  if (result.status !== "retry") return
  assert.equal(result.nextAttemptAt.toISOString(), "2026-10-03T12:01:00.000Z")
})

test("routes permanent failures immediately and exhausted transient failures after three total attempts", () => {
  const permanent = decideJevFailure({ attemptCount: 0, failure: { code: "invalid_response" }, now })
  assert.deepEqual(permanent, { status: "needs_review", attemptCount: 1, errorCode: "invalid_response" })
  const authentication = decideJevFailure({ attemptCount: 0, failure: { code: "provider_error" }, now })
  assert.deepEqual(authentication, { status: "needs_review", attemptCount: 1, errorCode: "provider_error" })

  const exhausted = decideJevFailure({ attemptCount: 2, failure: { code: "provider_unavailable" }, now })
  assert.deepEqual(exhausted, { status: "needs_review", attemptCount: 3, errorCode: "provider_unavailable" })
})

test("persists only recognized failure codes and valid Retry-After values", () => {
  assert.deepEqual(toSafeJevFailure({ code: "rate_limited", retryAfterMs: 500, message: "private request text" }), {
    code: "rate_limited",
    retryAfterMs: 500,
  })
  assert.deepEqual(toSafeJevFailure({ code: "unknown", retryAfterMs: -1, message: "private request text" }), {
    code: "provider_error",
  })
})
