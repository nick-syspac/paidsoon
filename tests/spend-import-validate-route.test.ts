import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let mockBatchStatus = "mapping"
let mockMappings: Array<{ sourceColumn: string; targetField: string }> = [
  { sourceColumn: "supplier", targetField: "supplier_name" },
  { sourceColumn: "amount", targetField: "amount" },
  { sourceColumn: "date", targetField: "transaction_date" },
]
let stagedRows = [
  {
    id: "row-1",
    rowNumber: 2,
    raw: { supplier: "", amount: "abc", date: "invalid" },
  },
]
let updatedRows: Array<{ id: string; status: string }> = []
let createdErrors = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: any

describe("Spend import validate route", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          const tx = {
            spendImportBatch: {
              findFirst: async () => ({
                id: "batch-1",
                userId: "user-1",
                status: mockBatchStatus,
              }),
              update: async ({ data }: { data: Record<string, unknown> }) => ({
                id: "batch-1",
                status: data.status,
                rowsTotal: data.rowsTotal,
                rowsValid: data.rowsValid,
                rowsWarning: data.rowsWarning,
                rowsFailed: data.rowsFailed,
              }),
            },
            spendImportColumnMapping: {
              findMany: async () => mockMappings,
            },
            spendImportStagingRow: {
              findMany: async () => stagedRows,
              update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
                updatedRows.push({ id: where.id, status: data.status })
                return { id: where.id, ...data }
              },
            },
            spendImportError: {
              deleteMany: async () => ({ count: 0 }),
              createMany: async ({ data }: { data: unknown[] }) => {
                createdErrors += data.length
                return { count: data.length }
              },
            },
          }

          return fn(tx)
        },
      },
    })

    ;({ POST } = await import("@/app/api/spend-imports/[batchId]/validate/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockBatchStatus = "mapping"
    mockMappings = [
      { sourceColumn: "supplier", targetField: "supplier_name" },
      { sourceColumn: "amount", targetField: "amount" },
      { sourceColumn: "date", targetField: "transaction_date" },
    ]
    stagedRows = [
      {
        id: "row-1",
        rowNumber: 2,
        raw: { supplier: "", amount: "abc", date: "invalid" },
      },
    ]
    updatedRows = []
    createdErrors = 0
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await POST(new Request("http://localhost/api/spend-imports/batch-1/validate", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })
    assert.equal(res.status, 401)
  })

  test("returns 400 when required mapping is incomplete", async () => {
    mockMappings = [{ sourceColumn: "supplier", targetField: "supplier_name" }]

    const res = await POST(new Request("http://localhost/api/spend-imports/batch-1/validate", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })
    const body = await res.json()

    assert.equal(res.status, 400)
    assert.equal(body.error, "Column mapping is incomplete")
    assert.deepEqual(body.missingFields, ["amount", "transaction_date"])
  })

  test("flags row errors and keeps batch in mapping state", async () => {
    const res = await POST(new Request("http://localhost/api/spend-imports/batch-1/validate", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.equal(body.status, "mapping")
    assert.equal(body.rowsFailed, 1)
    assert.equal(updatedRows[0]?.status, "error")
    assert.ok(createdErrors > 0)
  })
})
