import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-1" }

let mockInvoices: Array<{
  id: string
  userId: string
  clientEmail: string
  clientName: string
  currency: string
}> = []

let mockArrangementRecord: {
  id: string
  status: string
  arrangementType: string
  debtorEmail: string
  coverages: Array<{ trackedInvoiceId: string }>
} | null = null

let mockArrangementForStatus: { id: string; status: string } | null = null
let lastArrangementCreateArgs: unknown = null
let lastArrangementUpdateArgs: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createArrangementRoute: any, updateArrangementStatusRoute: any

describe("Arrangement route handlers", () => {
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
              findMany: async () => mockInvoices,
            },
            arrangement: {
              create: async (args: unknown) => {
                lastArrangementCreateArgs = args
                return mockArrangementRecord
              },
              findFirst: async () => mockArrangementForStatus,
              update: async (args: unknown) => {
                lastArrangementUpdateArgs = args
                return { id: "arr-1", status: "broken" }
              },
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ POST: createArrangementRoute } = await import("@/app/api/arrangements/route"))
    ;({ POST: updateArrangementStatusRoute } = await import("@/app/api/arrangements/[id]/status/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockInvoices = []
    mockArrangementRecord = {
      id: "arr-1",
      status: "active",
      arrangementType: "full_payment",
      debtorEmail: "client@example.com",
      coverages: [{ trackedInvoiceId: "inv-1" }],
    }
    mockArrangementForStatus = { id: "arr-1", status: "active" }
    lastArrangementCreateArgs = null
    lastArrangementUpdateArgs = null
  })

  test("POST /api/arrangements returns 401 when unauthenticated", async () => {
    mockUser = null
    const req = new Request("http://localhost/api/arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceIds: ["inv-1"],
        arrangementType: "full_payment",
        promisedPayBy: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    })
    const res = await createArrangementRoute(req)
    assert.equal(res.status, 401)
  })

  test("POST /api/arrangements rejects multi-debtor invoice bundle", async () => {
    mockInvoices = [
      { id: "inv-1", userId: "user-1", clientEmail: "a@example.com", clientName: "A", currency: "usd" },
      { id: "inv-2", userId: "user-1", clientEmail: "b@example.com", clientName: "B", currency: "usd" },
    ]

    const req = new Request("http://localhost/api/arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceIds: ["inv-1", "inv-2"],
        arrangementType: "full_payment",
        promisedPayBy: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    })

    const res = await createArrangementRoute(req)
    assert.equal(res.status, 422)
  })

  test("POST /api/arrangements creates arrangement for matching invoices", async () => {
    mockInvoices = [
      { id: "inv-1", userId: "user-1", clientEmail: "client@example.com", clientName: "Client", currency: "usd" },
      { id: "inv-2", userId: "user-1", clientEmail: "client@example.com", clientName: "Client", currency: "usd" },
    ]
    mockArrangementRecord = {
      id: "arr-1",
      status: "active",
      arrangementType: "full_payment",
      debtorEmail: "client@example.com",
      coverages: [{ trackedInvoiceId: "inv-1" }, { trackedInvoiceId: "inv-2" }],
    }

    const req = new Request("http://localhost/api/arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceIds: ["inv-1", "inv-2"],
        arrangementType: "full_payment",
        promisedPayBy: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    })

    const res = await createArrangementRoute(req)
    assert.equal(res.status, 201)
    assert.ok(lastArrangementCreateArgs)
  })

  test("POST /api/arrangements/[id]/status rejects invalid transition", async () => {
    mockArrangementForStatus = { id: "arr-1", status: "fulfilled" }

    const req = new Request("http://localhost/api/arrangements/arr-1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    })

    const res = await updateArrangementStatusRoute(req, {
      params: Promise.resolve({ id: "arr-1" }),
    })

    assert.equal(res.status, 422)
  })

  test("POST /api/arrangements/[id]/status updates lifecycle status", async () => {
    mockArrangementForStatus = { id: "arr-1", status: "active" }

    const req = new Request("http://localhost/api/arrangements/arr-1/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "broken" }),
    })

    const res = await updateArrangementStatusRoute(req, {
      params: Promise.resolve({ id: "arr-1" }),
    })

    assert.equal(res.status, 200)
    const updateArgs = lastArrangementUpdateArgs as { data: { status: string; breachedAt: Date | null } }
    assert.equal(updateArgs.data.status, "broken")
    assert.ok(updateArgs.data.breachedAt instanceof Date)
  })
})
