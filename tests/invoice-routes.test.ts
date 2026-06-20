/**
 * API route handler tests for invoice lifecycle operations.
 *
 * Uses Node's built-in mock.module() (requires Node ≥ 22.4 +
 * --experimental-test-module-mocks flag) to stub:
 *  - @/lib/supabase/server  → controls authentication state
 *  - @/lib/db/withUserContext → controls DB responses without a real database
 *
 * When mock.module() patches dependencies, tsx re-evaluates the test file and
 * re-registers the inner describe() blocks a second time at the root level.
 * Keeping mutable state at module scope ensures both registrations can access
 * the same variables.
 *
 * No real DB, Stripe, or Resend calls are made.
 */

import { describe, test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

// ─── Module-scope stubs (accessible across tsx re-evaluations) ───────────────

let mockUser: { id: string } | null = { id: "user-123" }
let lastFindFirstArgs: unknown = null
let lastUpdateArgs: unknown = null
let mockFindFirstResult: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pauseRoute: any, resumeRoute: any, snoozeRoute: any, resolveRoute: any

describe("Invoice route handlers", () => {
  // ─── Module mocks + route imports ─────────────────────────────────────────

  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          const tx = {
            trackedInvoice: {
              findFirst: async (args: unknown) => {
                lastFindFirstArgs = args
                return mockFindFirstResult
              },
              update: async (args: unknown) => {
                lastUpdateArgs = args
                return {}
              },
            },
          }
          return fn(tx)
        },
      },
    })

    // Dynamic imports happen AFTER mocks are registered
    ;({ POST: pauseRoute } = await import("@/app/api/invoices/[id]/pause/route"))
    ;({ POST: resumeRoute } = await import("@/app/api/invoices/[id]/resume/route"))
    ;({ POST: snoozeRoute } = await import("@/app/api/invoices/[id]/snooze/route"))
    ;({ POST: resolveRoute } = await import("@/app/api/invoices/[id]/resolve/route"))
  })

  // ─── Helper ───────────────────────────────────────────────────────────────

  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) }
  }

  function makeRequest() {
    return new Request("http://localhost/api/invoices/test-id/pause", { method: "POST" })
  }

  // ─── Pause ────────────────────────────────────────────────────────────────

  describe("POST /api/invoices/[id]/pause", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      lastFindFirstArgs = null
      lastUpdateArgs = null
      mockFindFirstResult = null
    })

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await pauseRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
      const body = await res.json()
      assert.strictEqual(body.error, "Unauthorized")
    })

    test("returns 404 when invoice not found or not pending", async () => {
      mockFindFirstResult = null
      const res = await pauseRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("returns 200 and pauses invoice when found", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      const res = await pauseRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.success, true)
    })

    test("queries only pending invoices", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      await pauseRoute(makeRequest(), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: string } }
      assert.strictEqual(args.where.status, "pending")
    })
  })

  // ─── Resume ───────────────────────────────────────────────────────────────

  describe("POST /api/invoices/[id]/resume", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      lastFindFirstArgs = null
      lastUpdateArgs = null
      mockFindFirstResult = null
    })

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await resumeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
    })

    test("returns 404 when invoice not found or not paused", async () => {
      mockFindFirstResult = null
      const res = await resumeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("returns 200 and resumes invoice when found", async () => {
      mockFindFirstResult = { id: "inv-1", status: "paused", userId: "user-123" }
      const res = await resumeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.success, true)
    })

    test("queries only paused invoices", async () => {
      mockFindFirstResult = { id: "inv-1", status: "paused", userId: "user-123" }
      await resumeRoute(makeRequest(), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: string } }
      assert.strictEqual(args.where.status, "paused")
    })
  })

  // ─── Snooze ───────────────────────────────────────────────────────────────

  describe("POST /api/invoices/[id]/snooze", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      lastFindFirstArgs = null
      lastUpdateArgs = null
      mockFindFirstResult = null
    })

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await snoozeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
    })

    test("returns 404 when invoice not found or wrong status", async () => {
      mockFindFirstResult = null
      const res = await snoozeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("returns 200 and includes snoozedUntil date", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      const before = Date.now()
      const res = await snoozeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.success, true)
      assert.ok(body.snoozedUntil, "snoozedUntil should be present")
      const snoozedAt = new Date(body.snoozedUntil).getTime()
      // Should be ~7 days from now
      assert.ok(snoozedAt > before + 6 * 24 * 60 * 60 * 1000)
      assert.ok(snoozedAt < before + 8 * 24 * 60 * 60 * 1000)
    })

    test("queries pending and snoozed invoices", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      await snoozeRoute(makeRequest(), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: { in: string[] } } }
      assert.deepStrictEqual(args.where.status.in.sort(), ["pending", "snoozed"].sort())
    })
  })

  // ─── Resolve ──────────────────────────────────────────────────────────────

  describe("POST /api/invoices/[id]/resolve", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      lastFindFirstArgs = null
      lastUpdateArgs = null
      mockFindFirstResult = null
    })

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await resolveRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
    })

    test("returns 404 when invoice not found", async () => {
      mockFindFirstResult = null
      const res = await resolveRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("returns 200 regardless of current invoice status (any status is resolvable)", async () => {
      const statuses = ["pending", "paused", "snoozed", "sequence_complete"]
      for (const status of statuses) {
        mockFindFirstResult = { id: "inv-1", status, userId: "user-123" }
        const res = await resolveRoute(makeRequest(), makeParams("inv-1"))
        assert.strictEqual(res.status, 200, `Expected 200 for status "${status}"`)
        const body = await res.json()
        assert.strictEqual(body.success, true)
      }
    })

    test("updates status to manually_resolved", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      await resolveRoute(makeRequest(), makeParams("inv-1"))
      const args = lastUpdateArgs as { data: { status: string } }
      assert.strictEqual(args.data.status, "manually_resolved")
    })
  })
})


// ─── Helper ────────────────────────────────────────────────────────────────────

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest() {
  return new Request("http://localhost/api/invoices/test-id/pause", { method: "POST" })
}

// ─── Pause route ──────────────────────────────────────────────────────────────

describe("POST /api/invoices/[id]/pause", () => {
  beforeEach(() => {
    mockUser = { id: "user-123" }
    lastFindFirstArgs = null
    lastUpdateArgs = null
    mockFindFirstResult = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await pauseRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 401)
    const body = await res.json()
    assert.strictEqual(body.error, "Unauthorized")
  })

  test("returns 404 when invoice not found or not pending", async () => {
    mockFindFirstResult = null
    const res = await pauseRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 404)
  })

  test("returns 200 and pauses invoice when found", async () => {
    mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
    const res = await pauseRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert.strictEqual(body.success, true)
  })

  test("queries only pending invoices", async () => {
    mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
    await pauseRoute(makeRequest(), makeParams("inv-1"))
    const args = lastFindFirstArgs as { where: { status: string } }
    assert.strictEqual(args.where.status, "pending")
  })
})

// ─── Resume route ─────────────────────────────────────────────────────────────

describe("POST /api/invoices/[id]/resume", () => {
  beforeEach(() => {
    mockUser = { id: "user-123" }
    lastFindFirstArgs = null
    lastUpdateArgs = null
    mockFindFirstResult = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await resumeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 401)
  })

  test("returns 404 when invoice not found or not paused", async () => {
    mockFindFirstResult = null
    const res = await resumeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 404)
  })

  test("returns 200 and resumes invoice when found", async () => {
    mockFindFirstResult = { id: "inv-1", status: "paused", userId: "user-123" }
    const res = await resumeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert.strictEqual(body.success, true)
  })

  test("queries only paused invoices", async () => {
    mockFindFirstResult = { id: "inv-1", status: "paused", userId: "user-123" }
    await resumeRoute(makeRequest(), makeParams("inv-1"))
    const args = lastFindFirstArgs as { where: { status: string } }
    assert.strictEqual(args.where.status, "paused")
  })
})

// ─── Snooze route ─────────────────────────────────────────────────────────────

describe("POST /api/invoices/[id]/snooze", () => {
  beforeEach(() => {
    mockUser = { id: "user-123" }
    lastFindFirstArgs = null
    lastUpdateArgs = null
    mockFindFirstResult = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await snoozeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 401)
  })

  test("returns 404 when invoice not found or wrong status", async () => {
    mockFindFirstResult = null
    const res = await snoozeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 404)
  })

  test("returns 200 and includes snoozedUntil date", async () => {
    mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
    const before = Date.now()
    const res = await snoozeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert.strictEqual(body.success, true)
    assert.ok(body.snoozedUntil, "snoozedUntil should be present")
    const snoozedAt = new Date(body.snoozedUntil).getTime()
    // Should be ~7 days from now
    assert.ok(snoozedAt > before + 6 * 24 * 60 * 60 * 1000)
    assert.ok(snoozedAt < before + 8 * 24 * 60 * 60 * 1000)
  })

  test("queries pending and snoozed invoices", async () => {
    mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
    await snoozeRoute(makeRequest(), makeParams("inv-1"))
    const args = lastFindFirstArgs as { where: { status: { in: string[] } } }
    assert.deepStrictEqual(args.where.status.in.sort(), ["pending", "snoozed"].sort())
  })
})

// ─── Resolve route ────────────────────────────────────────────────────────────

describe("POST /api/invoices/[id]/resolve", () => {
  beforeEach(() => {
    mockUser = { id: "user-123" }
    lastFindFirstArgs = null
    lastUpdateArgs = null
    mockFindFirstResult = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await resolveRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 401)
  })

  test("returns 404 when invoice not found", async () => {
    mockFindFirstResult = null
    const res = await resolveRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 404)
  })

  test("returns 200 regardless of current invoice status (any status is resolvable)", async () => {
    const statuses = ["pending", "paused", "snoozed", "sequence_complete"]
    for (const status of statuses) {
      mockFindFirstResult = { id: "inv-1", status, userId: "user-123" }
      const res = await resolveRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 200, `Expected 200 for status "${status}"`)
      const body = await res.json()
      assert.strictEqual(body.success, true)
    }
  })

  test("updates status to manually_resolved", async () => {
    mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
    await resolveRoute(makeRequest(), makeParams("inv-1"))
    const args = lastUpdateArgs as { data: { status: string } }
    assert.strictEqual(args.data.status, "manually_resolved")
  })
})
