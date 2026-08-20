/**
 * API route handler tests for manual invoice payment recording and
 * "mark as paid" (openspec/changes/add-invoice-payment-ledger).
 *
 * Uses Node's built-in mock.module() to stub:
 *  - @/lib/supabase/server  → controls authentication state
 *  - @/lib/db/withUserContext → controls DB responses without a real database
 *
 * No real DB, Stripe, or Resend calls are made.
 */

import { describe, test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let mockFindFirstResult: unknown = null
let mockPayments: { amount: number }[] = []
let lastFindFirstArgs: unknown = null
let lastCreateArgs: unknown = null
let lastUpdateArgs: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let paymentsRoute: any, markPaidRoute: any

describe("Invoice payment route handlers", () => {
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
            invoicePayment: {
              findMany: async () => mockPayments,
              create: async (args: { data: Record<string, unknown> }) => {
                lastCreateArgs = args
                return { id: "payment-1", ...args.data }
              },
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ POST: paymentsRoute } = await import("@/app/api/invoices/[id]/payments/route"))
    ;({ POST: markPaidRoute } = await import("@/app/api/invoices/[id]/mark-paid/route"))
  })

  function makeParams(id: string) {
    return { params: Promise.resolve({ id }) }
  }

  function makeRequest(path: string, body?: Record<string, unknown>) {
    return new Request(`http://localhost/api/invoices/test-id/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  }

  describe("POST /api/invoices/[id]/payments", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      mockFindFirstResult = null
      mockPayments = []
      lastFindFirstArgs = null
      lastCreateArgs = null
      lastUpdateArgs = null
    })

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await paymentsRoute(makeRequest("payments", { amount: 1000, currency: "usd" }), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
    })

    test("returns 400 when amount is missing or not a positive integer", async () => {
      mockFindFirstResult = { id: "inv-1", userId: "user-123", amountDue: 10_000, currency: "usd", status: "pending" }
      const res = await paymentsRoute(makeRequest("payments", { amount: -5, currency: "usd" }), makeParams("inv-1"))
      assert.strictEqual(res.status, 400)
    })

    test("returns 404 when invoice not found or in a terminal status", async () => {
      mockFindFirstResult = null
      const res = await paymentsRoute(makeRequest("payments", { amount: 1000, currency: "usd" }), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("excludes paid and manually_resolved invoices from findFirst", async () => {
      mockFindFirstResult = { id: "inv-1", userId: "user-123", amountDue: 10_000, currency: "usd", status: "pending" }
      await paymentsRoute(makeRequest("payments", { amount: 1000, currency: "usd" }), makeParams("inv-1"))
      const args = lastFindFirstArgs as { where: { status: { notIn: string[] } } }
      assert.deepStrictEqual(args.where.status.notIn.sort(), ["manually_resolved", "paid"])
    })

    test("returns 400 when payment currency does not match the invoice's currency", async () => {
      mockFindFirstResult = { id: "inv-1", userId: "user-123", amountDue: 10_000, currency: "usd", status: "pending" }
      const res = await paymentsRoute(makeRequest("payments", { amount: 1000, currency: "aud" }), makeParams("inv-1"))
      assert.strictEqual(res.status, 400)
    })

    test("records a partial payment with source manual and returns remaining outstanding", async () => {
      mockFindFirstResult = { id: "inv-1", userId: "user-123", amountDue: 10_000, currency: "usd", status: "pending" }
      const res = await paymentsRoute(makeRequest("payments", { amount: 4_000, currency: "usd", note: "part payment" }), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.success, true)
      assert.strictEqual(body.outstanding, 6_000)
      assert.strictEqual(body.markedPaid, false)
      const args = lastCreateArgs as { data: Record<string, unknown> }
      assert.strictEqual(args.data.source, "manual")
      assert.strictEqual(args.data.amount, 4_000)
      assert.strictEqual(args.data.note, "part payment")
    })

    test("marks the invoice paid once the ledger fully covers amountDue", async () => {
      mockFindFirstResult = { id: "inv-1", userId: "user-123", amountDue: 10_000, currency: "usd", status: "pending" }
      mockPayments = [{ amount: 6_000 }]
      const res = await paymentsRoute(makeRequest("payments", { amount: 4_000, currency: "usd" }), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.outstanding, 0)
      assert.strictEqual(body.markedPaid, true)
      const args = lastUpdateArgs as { data: { status: string } }
      assert.strictEqual(args.data.status, "paid")
    })
  })

  describe("POST /api/invoices/[id]/mark-paid", () => {
    beforeEach(() => {
      mockUser = { id: "user-123" }
      mockFindFirstResult = null
      mockPayments = []
      lastFindFirstArgs = null
      lastCreateArgs = null
      lastUpdateArgs = null
    })

    test("returns 401 when unauthenticated", async () => {
      mockUser = null
      const res = await markPaidRoute(makeRequest("mark-paid"), makeParams("inv-1"))
      assert.strictEqual(res.status, 401)
    })

    test("returns 404 when invoice not found or in a terminal status", async () => {
      mockFindFirstResult = null
      const res = await markPaidRoute(makeRequest("mark-paid"), makeParams("inv-1"))
      assert.strictEqual(res.status, 404)
    })

    test("returns 400 when the invoice has no outstanding balance", async () => {
      mockFindFirstResult = { id: "inv-1", userId: "user-123", amountDue: 10_000, currency: "usd", status: "pending" }
      mockPayments = [{ amount: 10_000 }]
      const res = await markPaidRoute(makeRequest("mark-paid"), makeParams("inv-1"))
      assert.strictEqual(res.status, 400)
    })

    test("records a payment for the full remaining outstanding balance and flips status to paid", async () => {
      mockFindFirstResult = { id: "inv-1", userId: "user-123", amountDue: 10_000, currency: "usd", status: "pending" }
      mockPayments = [{ amount: 3_000 }]
      const res = await markPaidRoute(makeRequest("mark-paid", { note: "paid by cheque" }), makeParams("inv-1"))
      assert.strictEqual(res.status, 200)
      const body = await res.json()
      assert.strictEqual(body.success, true)
      assert.strictEqual(body.outstanding, 0)
      assert.strictEqual(body.markedPaid, true)
      const createArgs = lastCreateArgs as { data: Record<string, unknown> }
      assert.strictEqual(createArgs.data.amount, 7_000)
      assert.strictEqual(createArgs.data.source, "manual")
      assert.strictEqual(createArgs.data.note, "paid by cheque")
      const updateArgs = lastUpdateArgs as { data: { status: string } }
      assert.strictEqual(updateArgs.data.status, "paid")
    })
  })
})
