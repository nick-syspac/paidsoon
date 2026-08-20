import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

type MockBatch = {
  id: string
  userId: string
  status: string
  duplicateMode: string
  defaultCurrency: string | null
  mapping: Record<string, unknown>
  rowsSkipped: number
  startedAt: Date | null
}

type MockStagingRow = {
  id: string
  rowNumber: number
  normalized: Record<string, string>
  status: string
}

type MockTrackedInvoice = { id: string; status: string }

let mockUser: { id: string } | null = { id: "user-1" }
let mockBatch: MockBatch
let mockStagingRows: MockStagingRow[]
let mockExistingInvoice: MockTrackedInvoice | null
let mockConnectionExists: boolean

let lastBatchUpdateArgs: unknown = null
let lastCreateArgs: unknown = null
let lastUpdateArgs: unknown = null
let stagingRowFindManyCalled = false

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let commitRoute: any

describe("Invoice import commit route", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          const tx = {
            invoiceImportBatch: {
              findFirst: async (args: { where: { id: string; userId: string } }) => {
                if (args.where.id !== mockBatch.id || args.where.userId !== mockBatch.userId) {
                  return null
                }
                return mockBatch
              },
              update: async (args: unknown) => {
                lastBatchUpdateArgs = args
                return { ...mockBatch, ...(args as { data: Partial<MockBatch> }).data }
              },
            },
            invoiceImportStagingRow: {
              findMany: async () => {
                stagingRowFindManyCalled = true
                return mockStagingRows
              },
            },
            invoiceConnection: {
              findFirst: async () => (mockConnectionExists ? { id: "conn-1" } : null),
              create: async () => ({ id: "conn-1" }),
            },
            trackedInvoice: {
              findUnique: async () => mockExistingInvoice,
              create: async (args: unknown) => {
                lastCreateArgs = args
                return { id: "ti-new" }
              },
              update: async (args: unknown) => {
                lastUpdateArgs = args
                return { id: mockExistingInvoice?.id }
              },
            },
            customer: {
              upsert: async () => ({ id: "customer-1" }),
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ POST: commitRoute } = await import("@/app/api/invoice-imports/[batchId]/commit/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockBatch = {
      id: "batch-1",
      userId: "user-1",
      status: "validated",
      duplicateMode: "skip_existing",
      defaultCurrency: "aud",
      mapping: {},
      rowsSkipped: 0,
      startedAt: null,
    }
    mockStagingRows = [
      {
        id: "row-1",
        rowNumber: 1,
        normalized: {
          customer_name: "Acme Pty Ltd",
          customer_email: "accounts@acme.example",
          invoice_number: "INV-1001",
          amount_outstanding: "500.00",
          due_date: "2026-09-01",
        },
        status: "valid",
      },
    ]
    mockExistingInvoice = null
    mockConnectionExists = false
    lastBatchUpdateArgs = null
    lastCreateArgs = null
    lastUpdateArgs = null
    stagingRowFindManyCalled = false
  })

  function postRequest() {
    return new Request("http://localhost/api/invoice-imports/batch-1/commit", { method: "POST" })
  }

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await commitRoute(postRequest(), { params: Promise.resolve({ batchId: "batch-1" }) })
    assert.equal(res.status, 401)
  })

  test("returns 404 when the batch belongs to a different tenant", async () => {
    mockUser = { id: "user-2" }
    const res = await commitRoute(postRequest(), { params: Promise.resolve({ batchId: "batch-1" }) })
    assert.equal(res.status, 404)
  })

  test("new invoices are created paused and never enqueue reminders", async () => {
    const res = await commitRoute(postRequest(), { params: Promise.resolve({ batchId: "batch-1" }) })
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.equal(body.invoicesCreated, 1)
    const createData = (lastCreateArgs as { data: Record<string, unknown> }).data
    assert.equal(createData.status, "paused")
    assert.equal(createData.currentStage, 0)
    assert.equal(createData.nextEmailAt, null)
  })

  test("skip_existing mode leaves a matching invoice untouched", async () => {
    mockExistingInvoice = { id: "ti-existing", status: "pending" }
    mockBatch.duplicateMode = "skip_existing"

    const res = await commitRoute(postRequest(), { params: Promise.resolve({ batchId: "batch-1" }) })
    const body = await res.json()

    assert.equal(body.invoicesSkipped, 1)
    assert.equal(lastUpdateArgs, null)
  })

  test("update_eligible mode protects terminal invoices from reopening", async () => {
    mockExistingInvoice = { id: "ti-existing", status: "paid" }
    mockBatch.duplicateMode = "update_eligible"

    const res = await commitRoute(postRequest(), { params: Promise.resolve({ batchId: "batch-1" }) })
    const body = await res.json()

    assert.equal(body.invoicesSkipped, 1)
    assert.equal(lastUpdateArgs, null)
  })

  test("update_eligible mode updates a non-terminal existing invoice without touching reminder state", async () => {
    mockExistingInvoice = { id: "ti-existing", status: "pending" }
    mockBatch.duplicateMode = "update_eligible"

    const res = await commitRoute(postRequest(), { params: Promise.resolve({ batchId: "batch-1" }) })
    const body = await res.json()

    assert.equal(body.invoicesUpdated, 1)
    const updateData = (lastUpdateArgs as { data: Record<string, unknown> }).data
    assert.equal("status" in updateData, false)
    assert.equal("currentStage" in updateData, false)
    assert.equal("nextEmailAt" in updateData, false)
  })

  test("a completed batch replays its stored result instead of recommitting", async () => {
    mockBatch.status = "completed"
    mockBatch.mapping = {
      commitResult: { invoicesCreated: 3, invoicesUpdated: 1, invoicesSkipped: 2 },
    }

    const res = await commitRoute(postRequest(), { params: Promise.resolve({ batchId: "batch-1" }) })
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.equal(body.replay, true)
    assert.equal(body.invoicesCreated, 3)
    assert.equal(body.invoicesUpdated, 1)
    assert.equal(body.invoicesSkipped, 2)
    assert.equal(stagingRowFindManyCalled, false)
    assert.equal(lastBatchUpdateArgs, null)
  })

  test("rejects committing a batch that has not been validated", async () => {
    mockBatch.status = "mapping"
    const res = await commitRoute(postRequest(), { params: Promise.resolve({ batchId: "batch-1" }) })
    assert.equal(res.status, 409)
  })
})
