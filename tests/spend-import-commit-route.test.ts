import "@/tests/helpers/subscriptionAccess"
import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import { detectionSqlAdapter, type DetectionWork } from "@/tests/helpers/commitGuardDetection"
import { requestCommitGuardDetection } from "@/lib/commitguard/detectionRequest"
import type { PrismaTx } from "@/lib/db/withUserContext"

let mockUser: { id: string } | null = { id: "user-1" }

let mockBatch: {
  id: string
  userId: string
  status: string
  defaultCurrency: string | null
  mapping: Record<string, unknown>
  rowsSkipped: number
  startedAt: Date | null
  completedAt: Date | null
  rowsFailed: number
}

let stagingRowsRead = false
let capturedFindings: Array<{ evidence: Record<string, unknown> }> = []
let mockSourceType: "bill" | "transaction" = "bill"
let capturedBankTransaction: Record<string, unknown> | null = null
const classificationHandoffs: Array<{ userId: string; sourceType: string; sourceRecordId: string }> = []
let classificationHandoffFails = false
const detectionWork = new Map<string, DetectionWork>()
let detectionInsertFails = false
let sourceWriteFails = false
let commitFails = false
let invalidRow = false
let detectionCalls = 0
let committedRows = 0
let lastTx: PrismaTx

let POST: typeof import("@/app/api/spend-imports/[batchId]/commit/route").POST

describe("Spend import commit route", () => {
  before(async () => {
    await mock.module("@/lib/commitguard/detection", { namedExports: {
      detectCommitmentCandidates: async () => { detectionCalls++; throw new Error("detector must not run during commit") },
    } })
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
          const previousBatch = structuredClone(mockBatch)
          const previousWork = structuredClone(detectionWork)
          const previousRows = committedRows
          const tx = {
            ...detectionSqlAdapter(detectionWork, () => detectionInsertFails),
            spendImportBatch: {
              findFirst: async (args: { where: { id: string; userId: string; status?: string; completedAt?: unknown; rowsSkipped?: number; rowsFailed?: number } }) => {
                if (args.where.id !== mockBatch.id || args.where.userId !== mockBatch.userId) return null
                if (args.where.status && (mockBatch.status !== args.where.status || !mockBatch.completedAt
                  || mockBatch.rowsSkipped !== 0 || mockBatch.rowsFailed !== 0)) return null
                return mockBatch
              },
              update: async ({ data }: { data: Record<string, unknown> }) => {
                mockBatch = { ...mockBatch, ...data }
                return mockBatch
              },
            },
            spendImportStagingRow: {
              findMany: async () => {
                stagingRowsRead = true
                return [
                  {
                    id: "row-1",
                    rowNumber: 2,
                    normalized: {
                      supplier_name: invalidRow ? "" : "Acme Pty Ltd",
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
              upsert: async () => {
                committedRows++
                if (sourceWriteFails) throw new Error("mock source write failure")
                return { id: "bill-1" }
              },
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

          lastTx = tx as unknown as PrismaTx
          try {
            const result = await fn(tx)
            if (commitFails) throw new Error("mock transaction commit failure")
            return result
          } catch (error) {
            mockBatch = previousBatch
            committedRows = previousRows
            detectionWork.clear()
            for (const [key, value] of previousWork) detectionWork.set(key, value)
            throw error
          }
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
      completedAt: null,
      rowsFailed: 0,
    }
    stagingRowsRead = false
    capturedFindings = []
    mockSourceType = "bill"
    capturedBankTransaction = null
    classificationHandoffs.length = 0
    classificationHandoffFails = false
    detectionWork.clear()
    detectionInsertFails = false
    sourceWriteFails = false
    commitFails = false
    invalidRow = false
    detectionCalls = 0
    committedRows = 0
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
    assert.equal(detectionWork.size, 2)
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
    assert.equal(detectionWork.size, 1)
  })

  test("completion and replay persist exactly one tenant-owned pending identity without detector execution", async () => {
    const invoke = () => POST(new Request("http://localhost/api/spend-imports/batch-1/commit", { method: "POST" }), {
      params: Promise.resolve({ batchId: "batch-1" }),
    })
    assert.equal((await invoke()).status, 200)
    assert.equal(mockBatch.status, "completed")
    assert.equal(detectionWork.size, 1)
    assert.deepEqual([...detectionWork.values()][0], {
      userId: "user-1", kind: "detect", dedupeKey: "detection:spend_import_batch:batch-1",
      sourceKind: "spend_import_batch", sourceId: "batch-1", calculationRevision: 0,
      state: "pending", attempts: 0, generation: 0,
    })
    stagingRowsRead = false
    assert.equal((await (await invoke()).json()).replay, true)
    assert.equal(stagingRowsRead, false)
    assert.equal(committedRows, 1)
    assert.equal(detectionWork.size, 1)
    assert.equal(detectionCalls, 0)
  })

  test("failed handoff cannot undo committed rows; canonical recovery after crash is tenant-scoped and idempotent", async () => {
    detectionInsertFails = true
    const res = await POST(new Request("http://localhost/commit", { method: "POST" }), { params: Promise.resolve({ batchId: "batch-1" }) })
    assert.equal(res.status, 200)
    assert.equal(mockBatch.status, "completed")
    assert.equal(committedRows, 1)
    assert.equal(detectionWork.size, 0)
    detectionInsertFails = false
    const source = { sourceKind: "spend_import_batch", sourceId: "batch-1" } as const
    assert.equal(await requestCommitGuardDetection(lastTx, "foreign-user", source), false)
    assert.equal(await requestCommitGuardDetection(lastTx, "user-1", source), true)
    assert.equal(await requestCommitGuardDetection(lastTx, "user-1", source), false)
    const work = [...detectionWork.values()][0]
    work.state = "failed"
    work.attempts = 6
    work.generation = 3
    assert.equal(await requestCommitGuardDetection(lastTx, "user-1", source), false)
    assert.equal(work.attempts, 6)
    assert.equal(work.generation, 3)
    assert.equal(detectionCalls, 0)
  })

  for (const failure of ["source", "commit"] as const) {
    test(`${failure} failure rolls back source mutations and leaves no orphan work`, async () => {
      sourceWriteFails = failure === "source"
      commitFails = failure === "commit"
      await assert.rejects(() => POST(new Request("http://localhost/commit", { method: "POST" }), {
        params: Promise.resolve({ batchId: "batch-1" }),
      }), /mock .*failure/)
      assert.equal(mockBatch.status, "validated")
      assert.equal(committedRows, 0)
      assert.equal(detectionWork.size, 0)
      assert.equal(classificationHandoffs.length, 0)
    })
  }

  for (const status of ["failed", "processing", "uploaded"] as const) {
    test(`${status} batch cannot create detection work`, async () => {
      mockBatch.status = status
      const res = await POST(new Request("http://localhost/commit", { method: "POST" }), { params: Promise.resolve({ batchId: "batch-1" }) })
      assert.equal(res.status, 409)
      assert.equal(detectionWork.size, 0)
    })
  }

  test("completed batch with skipped/failed rows or absent completion date is not eligible for automatic work", async () => {
    invalidRow = true
    const res = await POST(new Request("http://localhost/commit", { method: "POST" }), { params: Promise.resolve({ batchId: "batch-1" }) })
    assert.equal(res.status, 200)
    assert.equal(mockBatch.rowsSkipped, 1)
    assert.equal(detectionWork.size, 0)
    const source = { sourceKind: "spend_import_batch", sourceId: "batch-1" } as const
    mockBatch.rowsSkipped = 0
    mockBatch.rowsFailed = 1
    assert.equal(await requestCommitGuardDetection(lastTx, "user-1", source), false)
    mockBatch.rowsFailed = 0
    mockBatch.completedAt = null
    assert.equal(await requestCommitGuardDetection(lastTx, "user-1", source), false)
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
