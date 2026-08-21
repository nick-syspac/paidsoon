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
let pauseRoute: any, resumeRoute: any, snoozeRoute: any, resolveRoute: any, cancelSnoozeRoute: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let disputeRoute: any, resolveDisputeRoute: any

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
    ;({ POST: cancelSnoozeRoute } = await import("@/app/api/invoices/[id]/cancel-snooze/route"))
    ;({ POST: disputeRoute } = await import("@/app/api/invoices/[id]/dispute/route"))
    ;({ POST: resolveDisputeRoute } = await import("@/app/api/invoices/[id]/resolve-dispute/route"))
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

    test("queries only pending invoices", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      await snoozeRoute(makeRequest(), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: string } }
      assert.strictEqual(args.where.status, "pending")
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

  // ─── Cancel snooze ────────────────────────────────────────────────────────

  describe("POST /api/invoices/[id]/cancel-snooze", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      lastFindFirstArgs = null
      lastUpdateArgs = null
      mockFindFirstResult = null
    })

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
    })

    test("returns 404 when invoice not found or not snoozed", async () => {
      mockFindFirstResult = null
      const res = await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("returns 200 and resumes invoice when found", async () => {
      mockFindFirstResult = { id: "inv-1", status: "snoozed", userId: "user-123" }
      const res = await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.success, true)
    })

    test("queries only snoozed invoices", async () => {
      mockFindFirstResult = { id: "inv-1", status: "snoozed", userId: "user-123" }
      await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: string } }
      assert.strictEqual(args.where.status, "snoozed")
    })

    test("clears status to pending and snoozedUntil to null", async () => {
      mockFindFirstResult = { id: "inv-1", status: "snoozed", userId: "user-123" }
      await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
      const args = lastUpdateArgs as { data: { status: string; snoozedUntil: unknown } }
      assert.strictEqual(args.data.status, "pending")
      assert.strictEqual(args.data.snoozedUntil, null)
    })
  })

  // ─── Dispute ──────────────────────────────────────────────────────────────

  describe("POST /api/invoices/[id]/dispute", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      lastFindFirstArgs = null
      lastUpdateArgs = null
      mockFindFirstResult = null
    })

    function makeDisputeRequest(body?: Record<string, unknown>) {
      return new Request("http://localhost/api/invoices/test-id/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      })
    }

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await disputeRoute(makeDisputeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
    })

    test("returns 404 when invoice not found or not disputable", async () => {
      mockFindFirstResult = null
      const res = await disputeRoute(makeDisputeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("returns 400 when note exceeds max length", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      const res = await disputeRoute(makeDisputeRequest({ note: "a".repeat(2001) }), makeParams("inv-1"))
      assert.strictEqual(res.status, 400)
    })

    test("returns 200 and marks invoice disputed with note", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      const res = await disputeRoute(makeDisputeRequest({ note: "client says goods not delivered" }), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.success, true)
      const args = lastUpdateArgs as { data: { status: string; disputeNote: string | null } }
      assert.strictEqual(args.data.status, "disputed")
      assert.strictEqual(args.data.disputeNote, "client says goods not delivered")
    })

    test("cannot dispute another tenant's invoice (tenant isolation via findFirst scoping)", async () => {
      mockFindFirstResult = null // simulates RLS/findFirst excluding another tenant's row
      const res = await disputeRoute(makeDisputeRequest(), makeParams("other-tenant-inv"))
      assert.strictEqual(res.status, 404)
      const args = lastFindFirstArgs as { where: { userId: string } }
      assert.strictEqual(args.where.userId, "user-123")
    })

    test("excludes paid, disputed, and manually_resolved invoices from findFirst", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      await disputeRoute(makeDisputeRequest(), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: { notIn: string[] } } }
      assert.deepStrictEqual(args.where.status.notIn, ["paid", "disputed", "manually_resolved"])
    })
  })

  // ─── Resolve dispute ────────────────────────────────────────────────────────

  describe("POST /api/invoices/[id]/resolve-dispute", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      lastFindFirstArgs = null
      lastUpdateArgs = null
      mockFindFirstResult = null
    })

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await resolveDisputeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
    })

    test("returns 404 when invoice not found or not disputed", async () => {
      mockFindFirstResult = null
      const res = await resolveDisputeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("returns 200 and returns invoice to pending, clearing dispute note", async () => {
      mockFindFirstResult = { id: "inv-1", status: "disputed", userId: "user-123" }
      const res = await resolveDisputeRoute(makeRequest(), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.success, true)
      const args = lastUpdateArgs as { data: { status: string; disputeNote: unknown } }
      assert.strictEqual(args.data.status, "pending")
      assert.strictEqual(args.data.disputeNote, null)
    })

    test("stores an optional resolution note in disputeNote when provided", async () => {
      mockFindFirstResult = { id: "inv-1", status: "disputed", userId: "user-123" }
      const req = new Request("http://localhost/api/invoices/test-id/resolve-dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "client paid via bank transfer, dispute withdrawn" }),
      })
      const res = await resolveDisputeRoute(req, makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const args = lastUpdateArgs as { data: { disputeNote: unknown } }
      assert.strictEqual(args.data.disputeNote, "client paid via bank transfer, dispute withdrawn")
    })

    test("cannot resolve another tenant's invoice (tenant isolation via findFirst scoping)", async () => {
      mockFindFirstResult = null
      const res = await resolveDisputeRoute(makeRequest(), makeParams("other-tenant-inv"))
      assert.strictEqual(res.status, 404)
      const args = lastFindFirstArgs as { where: { userId: string } }
      assert.strictEqual(args.where.userId, "user-123")
    })

    test("queries only disputed invoices", async () => {
      mockFindFirstResult = { id: "inv-1", status: "disputed", userId: "user-123" }
      await resolveDisputeRoute(makeRequest(), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: string } }
      assert.strictEqual(args.where.status, "disputed")
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

test("queries only pending invoices", async () => {
      mockFindFirstResult = { id: "inv-1", status: "pending", userId: "user-123" }
      await snoozeRoute(makeRequest(), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: string } }
      assert.strictEqual(args.where.status, "pending")
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

// ─── Cancel snooze route ───────────────────────────────────────────────────────

describe("POST /api/invoices/[id]/cancel-snooze", () => {
  beforeEach(() => {
    mockUser = { id: "user-123" }
    lastFindFirstArgs = null
    lastUpdateArgs = null
    mockFindFirstResult = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 401)
  })

  test("returns 404 when invoice not found or not snoozed", async () => {
    mockFindFirstResult = null
    const res = await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 404)
  })

  test("returns 200 and resumes invoice when found", async () => {
    mockFindFirstResult = { id: "inv-1", status: "snoozed", userId: "user-123" }
    const res = await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert.strictEqual(body.success, true)
  })

  test("queries only snoozed invoices", async () => {
    mockFindFirstResult = { id: "inv-1", status: "snoozed", userId: "user-123" }
    await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
    const args = lastFindFirstArgs as { where: { status: string } }
    assert.strictEqual(args.where.status, "snoozed")
  })

  test("clears status to pending and snoozedUntil to null", async () => {
    mockFindFirstResult = { id: "inv-1", status: "snoozed", userId: "user-123" }
    await cancelSnoozeRoute(makeRequest(), makeParams("inv-1"))
    const args = lastUpdateArgs as { data: { status: string; snoozedUntil: unknown } }
    assert.strictEqual(args.data.status, "pending")
    assert.strictEqual(args.data.snoozedUntil, null)
  })
})
