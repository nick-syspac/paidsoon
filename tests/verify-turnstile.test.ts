/**
 * Unit tests for lib/auth/verifyTurnstile.ts
 *
 * Mocks globalThis.fetch to avoid real network calls.
 * Sets / clears TURNSTILE_SECRET_KEY around each test.
 */

import { describe, test, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

// Helper to build a fake fetch response
function makeFetchResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response
}

describe("verifyTurnstile", () => {
  let verifyTurnstile: (typeof import("@/lib/auth/verifyTurnstile"))["verifyTurnstile"]

  beforeEach(async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret"
    // Re-import fresh each time so env changes are picked up
    ;({ verifyTurnstile } = await import("@/lib/auth/verifyTurnstile"))
  })

  afterEach(() => {
    mock.restoreAll()
    delete process.env.TURNSTILE_SECRET_KEY
  })

  test("returns success:true when Siteverify accepts the token", async () => {
    globalThis.fetch = mock.fn(async () =>
      makeFetchResponse(true, { success: true })
    ) as unknown as typeof fetch

    const result = await verifyTurnstile("valid-token")
    assert.deepEqual(result, { success: true })
  })

  test("returns success:false when token is missing (null)", async () => {
    const result = await verifyTurnstile(null)
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.status, 400)
    }
  })

  test("returns success:false when token is missing (undefined)", async () => {
    const result = await verifyTurnstile(undefined)
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.status, 400)
    }
  })

  test("returns success:false when token is empty string", async () => {
    const result = await verifyTurnstile("")
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.status, 400)
    }
  })

  test("returns success:false when Siteverify rejects the token", async () => {
    globalThis.fetch = mock.fn(async () =>
      makeFetchResponse(true, { success: false })
    ) as unknown as typeof fetch

    const result = await verifyTurnstile("invalid-token")
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.status, 400)
      assert.equal(result.error, "Security check failed. Please try again.")
    }
  })

  test("returns success:false when Siteverify returns a non-200 HTTP status", async () => {
    globalThis.fetch = mock.fn(async () =>
      makeFetchResponse(false, {})
    ) as unknown as typeof fetch

    const result = await verifyTurnstile("any-token")
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.status, 503)
    }
  })

  test("returns success:false with status 503 when fetch throws (network error)", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("Network failure")
    }) as unknown as typeof fetch

    const result = await verifyTurnstile("any-token")
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.status, 503)
    }
  })

  test("returns success:false with status 503 on AbortError (timeout)", async () => {
    globalThis.fetch = mock.fn(async () => {
      const err = new Error("The operation was aborted")
      err.name = "AbortError"
      throw err
    }) as unknown as typeof fetch

    const result = await verifyTurnstile("any-token")
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.status, 503)
    }
  })

  test("returns success:false with status 503 when TURNSTILE_SECRET_KEY is not set", async () => {
    delete process.env.TURNSTILE_SECRET_KEY

    const result = await verifyTurnstile("any-token")
    assert.equal(result.success, false)
    if (!result.success) {
      assert.equal(result.status, 503)
    }
  })
})
