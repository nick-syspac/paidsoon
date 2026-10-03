import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }

let mockBatch: {
  id: string
  userId: string
  status: string
  defaultCurrency: string | null
  mapping: Record<string, unknown>
  rowsSkipped: number
  startedAt: Date | null
}

let stagingRowsRead = false
let capturedFindings: Array<{ evidence: Record<string, unknown> }> = []
let mockSourceType: "bill" | "transaction" = "bill"
let capturedBankTransaction: Record<string, unknown> | null = null
const classificationHandoffs: Array<{ userId: string; sourceType: string; sourceRecordId: string }> = []
let classificationHandoffFails = false

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: any

describe("Spend import commit route", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
      },
    })

    await mock.module("@/lib/spendleak/engine", {
      namedExports: {
        detectSpendFindings: () => [
          {
            id: "finding-1",
            findingType: "duplicate_payment",
            subjectKey: "supplier:acme",
            severity: "high",
            summary: "Potential duplicate spend",
            state: "open",
            evidence: { supplier: "Acme" },
            detectedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      },
    })

    await mock.module("@/lib/spendleak/persist", {
      namedExports: {
        upsertSpendFindings: async ({ findings }: { findings: Array<{ evidence: Record<string, unknown> }> }) => {
          capturedFindings = findings
          return findings.length
        },
      },
    })

    await mock.module("@/lib/spendClassification/handoff", {
      namedExports: {
        handoffImportedSpendForClassification: async (userId: string, sourceType: string, sourceRecordId: string) => {
          classificationHandoffs.push({ userId, sourceType, sourceRecordId })
          if (classificationHandoffFails) throw new Error("classification unavailable")
        },
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          const tx = {
            spendImportBatch: {
              findFirst: async (args: { where: { id: string; userId: string } }) => {
                if (args.where.id !== mockBatch.id || args.where.userId !== mockBatch.userId) return null
                return mockBatch
              },
              update: async ({ data }: { data: Record<string, unknown> }) => ({ ...mockBatch, ...data }),
            },
            spendImportStagingRow: {
              findMany: async () => {
                stagingRowsRead = true
                return [
                  {
                    id: "row-1",
                    rowNumber: 2,
                    normalized: {
                      supplier_name: "Acme Pty Ltd",
                      amount: "100.00",
                      transaction_date: "2026-09-01",
                      source_type: mockSourceType,
                      account_name: "Software subscriptions",
                      account_code: "620",
                    },
                    status: "valid",
                  },
                ]
              },
            },
            accountingConnection: {
              findFirst: async () => ({ id: "conn-import" }),
              create: async () => ({ id: "conn-import" }),
            },
            supplierProfile: {
              upsert: async () => ({ id: "supplier-1" }),
              findMany: async () => [{ sourceId: "supplier:acme", supplierName: "Acme Pty Ltd" }],
            },
            importedBill: {
              upsert: async () => ({ id: "bill-1" }),
              findMany: async () => [
                {
                  sourceId: "bill-1",
                  supplierName: "Acme Pty Ltd",
                  amountCents: 10000,
                  dueDate: new Date("2026-09-10T00:00:00.000Z"),
                  paidDate: new Date("2026-09-01T00:00:00.000Z"),
                  status: "paid",
                  sourceUpdatedAt: new Date("2026-09-01T00:00:00.000Z"),
                },
              ],
            },
            importedBankTransaction: {
              upsert: async (args: { create: Record<string, unknown> }) => {
                capturedBankTransaction = args.create
                return { id: "txn-1" }
              },
              findMany: async () => [],
            },
            spendInsight: {
              findUnique: async () => null,
              create: async () => ({ id: "finding-1" }),
              update: async () => ({ id: "finding-1" }),
            },
          }

          return fn(tx)
        },
      },
    })

    ;({ POST } = await import("@/app/api/spend-imports/[batchId]/commit/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockBatch = {
      id: "batch-1",
      userId: "user-1",
      status: "validated",
      defaultCurrency: "AUD",
      mapping: {},
      rowsSkipped: 0,
      startedAt: null,
    }
    stagingRowsRead = false
    capturedFindings = []
    mockSourceType = "bill"
    capturedBankTransaction = null
    classificationHandoffs.length = 0
    classificationHandoffFails = false
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await POST(new Request("http://localhost/api/spend-imports/batch-1/commit", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })
    assert.equal(res.status, 401)
  })

  test("replays previously completed commit result without reprocessing rows", async () => {
    mockBatch.status = "completed"
    mockBatch.rowsSkipped = 2
    mockBatch.mapping = {
      commitResult: {
        recordsUpserted: 4,
        findingsUpserted: 2,
        recordsSkipped: 2,
      },
    }

    const res = await POST(new Request("http://localhost/api/spend-imports/batch-1/commit", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.equal(body.replay, true)
    assert.equal(body.recordsUpserted, 4)
    assert.equal(stagingRowsRead, false)
    assert.equal(classificationHandoffs.length, 0)
  })

  test("committed findings are tagged as expense import source", async () => {
    const res = await POST(new Request("http://localhost/api/spend-imports/batch-1/commit", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })

    assert.equal(res.status, 200)
    assert.equal(capturedFindings.length, 1)
    assert.equal(capturedFindings[0]?.evidence.source, "expense_import")
    assert.deepEqual(classificationHandoffs, [
      { userId: "user-1", sourceType: "imported_bill", sourceRecordId: "bill-1" },
    ])
  })

  test("row re-import invokes the same idempotent classification handoff for the existing source record", async () => {
    const first = await POST(new Request("http://localhost/api/spend-imports/batch-1/commit", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })
    mockBatch = { ...mockBatch, id: "batch-2", status: "validated" }
    const second = await POST(new Request("http://localhost/api/spend-imports/batch-2/commit", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-2" }),
    })

    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.deepEqual(classificationHandoffs, [
      { userId: "user-1", sourceType: "imported_bill", sourceRecordId: "bill-1" },
      { userId: "user-1", sourceType: "imported_bill", sourceRecordId: "bill-1" },
    ])
  })

  test("classification handoff failures do not fail the committed spend import", async () => {
    classificationHandoffFails = true
    const res = await POST(new Request("http://localhost/api/spend-imports/batch-1/commit", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })
    const body = await res.json()

    assert.equal(res.status, 200)
    assert.equal(body.status, "completed")
    assert.equal(body.recordsUpserted, 1)
    assert.equal(classificationHandoffs.length, 1)
  })

  test("stores CSV transaction direction and expense coding separately from bank account fields", async () => {
    mockSourceType = "transaction"
    const res = await POST(new Request("http://localhost/api/spend-imports/batch-1/commit", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })

    assert.equal(res.status, 200)
    assert.equal(capturedBankTransaction?.amountCents, -10000)
    assert.equal(capturedBankTransaction?.direction, "unknown")
    assert.equal(capturedBankTransaction?.accountName, null)
    assert.equal(capturedBankTransaction?.accountCode, null)
    assert.equal(capturedBankTransaction?.expenseAccountName, "Software subscriptions")
    assert.equal(capturedBankTransaction?.expenseAccountCode, "620")
    assert.deepEqual(classificationHandoffs, [
      { userId: "user-1", sourceType: "imported_bank_transaction", sourceRecordId: "txn-1" },
    ])
  })
})
