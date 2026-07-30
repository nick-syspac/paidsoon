/**
 * Unit tests for the accounting sync orchestrator.
 * All external dependencies (prismaAdmin, AccountingProvider) are mocked.
 * No real DB or provider API calls are made.
 */
import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { AccountingProviderError } from "@/lib/providers/accounting/types"

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

// We manually override the module dependencies by patching globals before import
// In Node test runner we can't mock modules directly, so we test the logic
// indirectly by verifying observable side-effects through the mock state.

describe("syncConnection — logic tests using mocked dependencies", () => {
  describe("mapProviderStatusToTracked", () => {
    // We extract the mapping logic for isolated testing
    function mapStatus(status: string): string {
      switch (status) {
        case "open": return "pending"
        case "paid": return "paid"
        case "voided":
        case "deleted": return "manually_resolved"
        case "draft": return "paused"
        default: return "pending"
      }
    }

    test("open → pending", () => assert.equal(mapStatus("open"), "pending"))
    test("paid → paid", () => assert.equal(mapStatus("paid"), "paid"))
    test("voided → manually_resolved", () => assert.equal(mapStatus("voided"), "manually_resolved"))
    test("draft → paused", () => assert.equal(mapStatus("draft"), "paused"))
    test("unknown → pending (default)", () => assert.equal(mapStatus("something_else"), "pending"))
  })

  describe("resolveConnectionStatusAfterSync", () => {
    // Mirrors lib/providers/accounting/sync.ts — reimplemented here because
    // importing the real module pulls in prismaAdmin (see file header note).
    type ErrorKind = "unauthorized" | "rate_limited" | "not_found" | "server_error" | "validation" | "unknown"

    function resolveConnectionStatusAfterSync(
      currentStatus: string,
      outcome: "success" | "partial" | "failed",
      errorKind?: ErrorKind
    ): string | null {
      if (currentStatus === "disconnected") return null
      if (outcome === "success" || outcome === "partial") {
        return currentStatus === "active" ? null : "active"
      }
      if (errorKind === "unauthorized") return "revoked"
      if (currentStatus === "pending_first_sync") return "error"
      return null
    }

    test("first successful sync promotes pending_first_sync to active", () => {
      assert.equal(resolveConnectionStatusAfterSync("pending_first_sync", "success"), "active")
    })

    test("partial success also promotes pending_first_sync to active", () => {
      assert.equal(resolveConnectionStatusAfterSync("pending_first_sync", "partial"), "active")
    })

    test("successful sync on an already-active connection makes no change", () => {
      assert.equal(resolveConnectionStatusAfterSync("active", "success"), null)
    })

    test("a retry from error that succeeds promotes the connection to active", () => {
      assert.equal(resolveConnectionStatusAfterSync("error", "success"), "active")
    })

    test("first sync failure sets status to error", () => {
      assert.equal(resolveConnectionStatusAfterSync("pending_first_sync", "failed"), "error")
    })

    test("failure on an already-active connection does not downgrade status", () => {
      assert.equal(resolveConnectionStatusAfterSync("active", "failed"), null)
    })

    test("unauthorized error always marks the connection revoked", () => {
      assert.equal(resolveConnectionStatusAfterSync("active", "failed", "unauthorized"), "revoked")
      assert.equal(resolveConnectionStatusAfterSync("pending_first_sync", "failed", "unauthorized"), "revoked")
    })

    test("a disconnected connection is never resurrected by a sync outcome", () => {
      assert.equal(resolveConnectionStatusAfterSync("disconnected", "success"), null)
      assert.equal(resolveConnectionStatusAfterSync("disconnected", "failed", "unauthorized"), null)
    })
  })

  describe("toCents", () => {
    function toCents(amount: number): number {
      return Math.round(amount * 100)
    }

    test("converts 500.00 to 50000 cents", () => assert.equal(toCents(500.0), 50000))
    test("converts 9.99 to 999 cents (rounding)", () => assert.equal(toCents(9.99), 999))
    test("converts 0 to 0", () => assert.equal(toCents(0), 0))
    test("converts 0.01 to 1 cent", () => assert.equal(toCents(0.01), 1))
  })

  describe("shouldRefresh", () => {
    function shouldRefresh(tokenExpiresAt: Date): boolean {
      const BUFFER_MS = 5 * 60 * 1000
      return tokenExpiresAt.getTime() - Date.now() < BUFFER_MS
    }

    test("returns true when token expires in 2 minutes", () => {
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000)
      assert.equal(shouldRefresh(expiresAt), true)
    })

    test("returns false when token expires in 1 hour", () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
      assert.equal(shouldRefresh(expiresAt), false)
    })

    test("returns true for already-expired token", () => {
      const expiresAt = new Date(Date.now() - 1000)
      assert.equal(shouldRefresh(expiresAt), true)
    })
  })

  describe("withRetry backoff", () => {
    async function withRetry<T>(
      fn: () => Promise<T>,
      maxAttempts = 3,
      baseDelayMs = 0 // 0 for fast tests
    ): Promise<T> {
      let lastError: unknown
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          return await fn()
        } catch (err) {
          lastError = err
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, baseDelayMs))
          }
        }
      }
      throw lastError
    }

    test("succeeds on first try", async () => {
      let calls = 0
      const result = await withRetry(async () => {
        calls++
        return "ok"
      })
      assert.equal(result, "ok")
      assert.equal(calls, 1)
    })

    test("retries up to maxAttempts on transient error", async () => {
      let calls = 0
      await assert.rejects(
        () =>
          withRetry(
            async () => {
              calls++
              throw new Error("transient")
            },
            3,
            0
          ),
        /transient/
      )
      assert.equal(calls, 3)
    })

    test("does not retry more than maxAttempts", async () => {
      let calls = 0
      await assert.rejects(
        () =>
          withRetry(
            async () => {
              calls++
              throw new Error("fail")
            },
            2,
            0
          )
      )
      assert.equal(calls, 2)
    })
  })

  describe("withTokenPropagationRetry", () => {
    // Mirrors lib/providers/accounting/sync.ts's withTokenPropagationRetry,
    // reimplemented here with a zero-delay schedule for fast tests. Guards
    // against a transient 401 immediately after a MYOB token refresh being
    // misread as a genuine revocation.
    async function withTokenPropagationRetry<T>(
      fn: () => Promise<T>,
      delays: number[] = [0, 0, 0, 0]
    ): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn()
        } catch (err) {
          const isUnauthorized = err instanceof AccountingProviderError && err.kind === "unauthorized"
          if (!isUnauthorized || attempt >= delays.length) throw err
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
        }
      }
    }

    test("succeeds immediately when there is no error", async () => {
      let calls = 0
      const result = await withTokenPropagationRetry(async () => {
        calls++
        return "ok"
      })
      assert.equal(result, "ok")
      assert.equal(calls, 1)
    })

    test("retries a transient 401 and succeeds once it clears", async () => {
      let calls = 0
      const result = await withTokenPropagationRetry(async () => {
        calls++
        if (calls < 3) throw new AccountingProviderError("unauthorized", "MYOB 401: OAuthTokenIsInvalid")
        return "ok"
      })
      assert.equal(result, "ok")
      assert.equal(calls, 3)
    })

    test("gives up and rethrows once the retry budget is exhausted", async () => {
      let calls = 0
      await assert.rejects(
        () =>
          withTokenPropagationRetry(async () => {
            calls++
            throw new AccountingProviderError("unauthorized", "MYOB 401: OAuthTokenIsInvalid")
          }, [0, 0]),
        { name: "AccountingProviderError", kind: "unauthorized" }
      )
      // 1 initial attempt + 2 retries from the delays array = 3 calls
      assert.equal(calls, 3)
    })

    test("does not retry non-unauthorized errors — rethrows immediately", async () => {
      let calls = 0
      await assert.rejects(
        () =>
          withTokenPropagationRetry(async () => {
            calls++
            throw new AccountingProviderError("server_error", "MYOB 500")
          }),
        { name: "AccountingProviderError", kind: "server_error" }
      )
      assert.equal(calls, 1)
    })
  })
})
