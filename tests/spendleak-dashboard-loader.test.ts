import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let withUserContextUserId: string | null = null
let mockDbState = {
  findings: [] as Array<{ id: string; findingType: string; estimatedAnnualCents: number | null; severity: string; state: string }>,
  connectionCount: 1,
  latestBillSyncAt: new Date("2026-09-10T00:00:00.000Z") as Date | null,
  latestTxnSyncAt: new Date("2026-09-11T00:00:00.000Z") as Date | null,
  latestSupplierSyncAt: null as Date | null,
  linkedCommitments: [] as Array<{ linkedSpendInsightId: string | null }>,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadSpendLeakDashboard: any

describe("loadSpendLeakDashboard", () => {
  before(async () => {
    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (userId: string, fn: (tx: unknown) => Promise<unknown>) => {
          withUserContextUserId = userId

          const tx = {
            spendInsight: {
              findMany: async () => mockDbState.findings,
            },
            accountingConnection: {
              count: async () => mockDbState.connectionCount,
            },
            importedBill: {
              findFirst: async () => ({ syncedAt: mockDbState.latestBillSyncAt }),
            },
            importedBankTransaction: {
              findFirst: async () => ({ syncedAt: mockDbState.latestTxnSyncAt }),
            },
            supplierProfile: {
              findFirst: async () => ({ syncedAt: mockDbState.latestSupplierSyncAt }),
            },
            commitment: {
              findMany: async () => mockDbState.linkedCommitments,
            },
          }

          return fn(tx)
        },
      },
    })

    ;({ loadSpendLeakDashboard } = await import("@/lib/dashboard/loadSpendLeakDashboard"))
  })

  beforeEach(() => {
    withUserContextUserId = null
    mockDbState = {
      findings: [],
      connectionCount: 1,
      latestBillSyncAt: new Date("2026-09-10T00:00:00.000Z"),
      latestTxnSyncAt: new Date("2026-09-11T00:00:00.000Z"),
      latestSupplierSyncAt: null,
      linkedCommitments: [],
    }
  })

  test("aggregates linked commitment counts by finding id", async () => {
    mockDbState.findings = [
      { id: "f-1", findingType: "duplicate_payment", estimatedAnnualCents: 12_000, severity: "high", state: "open" },
      { id: "f-2", findingType: "renewal", estimatedAnnualCents: 24_000, severity: "medium", state: "open" },
    ]
    mockDbState.linkedCommitments = [
      { linkedSpendInsightId: "f-1" },
      { linkedSpendInsightId: "f-1" },
      { linkedSpendInsightId: "f-2" },
      { linkedSpendInsightId: null },
    ]

    const result = await loadSpendLeakDashboard("user-1")

    assert.equal(withUserContextUserId, "user-1")
    assert.deepEqual(result.linkedCommitmentCountsByFindingId, {
      "f-1": 2,
      "f-2": 1,
    })
    assert.equal(result.sourceSyncCount, 2)
    assert.equal(result.hasAccountingConnection, true)
  })

  test("reports stale state when no connected source has sync timestamps", async () => {
    mockDbState.connectionCount = 0
    mockDbState.latestBillSyncAt = null
    mockDbState.latestTxnSyncAt = null
    mockDbState.latestSupplierSyncAt = null

    const result = await loadSpendLeakDashboard("user-2")

    assert.equal(withUserContextUserId, "user-2")
    assert.equal(result.sourceSyncCount, 0)
    assert.equal(result.latestSyncAt, null)
    assert.equal(result.hasAccountingConnection, false)
    assert.equal(result.status.state, "no_connection")
  })
})