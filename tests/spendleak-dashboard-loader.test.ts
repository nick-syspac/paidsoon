import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let withUserContextUserId: string | null = null
let enabledSourceTypes: Array<"bills" | "bank_transactions" | "suppliers"> = [
  "bills",
  "bank_transactions",
  "suppliers",
]
let mockDbState = {
  findings: [] as Array<{ id: string; findingType: string; estimatedAnnualCents: number | null; severity: string; state: string }>,
  connectionCount: 1,
  latestBillSyncAt: new Date("2026-09-10T00:00:00.000Z") as Date | null,
  latestTxnSyncAt: new Date("2026-09-11T00:00:00.000Z") as Date | null,
  latestSupplierSyncAt: null as Date | null,
  billRecordCount: 12,
  bankTransactionRecordCount: 37,
  supplierRecordCount: 0,
  linkedCommitments: [] as Array<{ linkedSpendInsightId: string | null }>,
  importedBills: [] as Array<{ id: string; amountCents: number; currency: string; status: string }>,
  importedBankTransactions: [] as Array<{ id: string; amountCents: number; currency: string; direction: "outflow" | "inflow" | "unknown" }>,
  classifications: [] as Array<{
    sourceType: string
    sourceRecordId: string
    status: string
    category: { id: string; name: string; status: string } | null
    refundFor?: { sourceType: string; sourceRecordId: string; status: string; category: { id: string; name: string } | null } | null
  }>,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadSpendLeakDashboard: any

describe("loadSpendLeakDashboard", () => {
  before(async () => {
    await mock.module("@/lib/spendleak/sourceSettings", {
      namedExports: {
        getSpendLeakSourceSettings: async () => ({
          enabledSourceTypes,
          isDefault: false,
        }),
      },
    })

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
              count: async () => mockDbState.billRecordCount,
              findMany: async () => mockDbState.importedBills,
            },
            importedBankTransaction: {
              findFirst: async () => ({ syncedAt: mockDbState.latestTxnSyncAt }),
              count: async () => mockDbState.bankTransactionRecordCount,
              findMany: async () => mockDbState.importedBankTransactions,
            },
            spendClassification: {
              findMany: async () => mockDbState.classifications,
            },
            supplierProfile: {
              findFirst: async () => ({ syncedAt: mockDbState.latestSupplierSyncAt }),
              count: async () => mockDbState.supplierRecordCount,
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
    enabledSourceTypes = ["bills", "bank_transactions", "suppliers"]
    mockDbState = {
      findings: [],
      connectionCount: 1,
      latestBillSyncAt: new Date("2026-09-10T00:00:00.000Z"),
      latestTxnSyncAt: new Date("2026-09-11T00:00:00.000Z"),
      latestSupplierSyncAt: null,
      billRecordCount: 12,
      bankTransactionRecordCount: 37,
      supplierRecordCount: 0,
      linkedCommitments: [],
      importedBills: [],
      importedBankTransactions: [],
      classifications: [],
    }
  })

  test("loads confirmed and unresolved category totals with source traceability", async () => {
    mockDbState.importedBills = [
      { id: "bill-1", amountCents: 12500, currency: "AUD", status: "open" },
      { id: "bill-2", amountCents: 5000, currency: "AUD", status: "open" },
    ]
    mockDbState.importedBankTransactions = [
      { id: "txn-1", amountCents: 7000, currency: "AUD", direction: "outflow" },
      { id: "txn-unknown", amountCents: -3200, currency: "AUD", direction: "unknown" },
    ]
    mockDbState.classifications = [
      {
        sourceType: "imported_bill",
        sourceRecordId: "bill-1",
        status: "confirmed",
        category: { id: "category-software", name: "Software & Cloud", status: "active" },
      },
      {
        sourceType: "imported_bank_transaction",
        sourceRecordId: "txn-1",
        status: "confirmed",
        category: { id: "category-software", name: "Software & Cloud", status: "active" },
      },
      {
        sourceType: "imported_bill",
        sourceRecordId: "bill-2",
        status: "suggested",
        category: { id: "category-software", name: "Software & Cloud", status: "active" },
      },
    ]

    const result = await loadSpendLeakDashboard("user-1")

    assert.deepEqual(result.categorySpendSummaries.confirmed, [
      {
        sourceType: "bank_transactions",
        currency: "AUD",
        categoryId: "category-software",
        categoryName: "Software & Cloud",
        amountCents: 7000,
        recordCount: 1,
        sourceRecordIds: ["txn-1"],
        refundRecordCount: 0,
        refundRecordIds: [],
      },
      {
        sourceType: "bills",
        currency: "AUD",
        categoryId: "category-software",
        categoryName: "Software & Cloud",
        amountCents: 12500,
        recordCount: 1,
        sourceRecordIds: ["bill-1"],
        refundRecordCount: 0,
        refundRecordIds: [],
      },
    ])
    assert.deepEqual(result.categorySpendSummaries.unresolved, [
      {
        sourceType: "bank_transactions",
        currency: "AUD",
        bucket: "unknown_direction",
        amountCents: 3200,
        recordCount: 1,
        sourceRecordIds: ["txn-unknown"],
      },
      {
        sourceType: "bills",
        currency: "AUD",
        bucket: "unconfirmed",
        amountCents: 5000,
        recordCount: 1,
        sourceRecordIds: ["bill-2"],
      },
    ])
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
    assert.deepEqual(result.enabledSourceTypes, ["bills", "bank_transactions", "suppliers"])
    assert.equal(result.expectedSourceCount, 3)
    assert.equal(result.syncedExpectedSourceCount, 2)
    assert.equal(result.hasAccountingConnection, true)
    assert.deepEqual(result.selectedSourceCoverage, [
      {
        sourceType: "bills",
        synced: true,
        recordCount: 12,
        latestSyncedAt: new Date("2026-09-10T00:00:00.000Z"),
      },
      {
        sourceType: "bank_transactions",
        synced: true,
        recordCount: 37,
        latestSyncedAt: new Date("2026-09-11T00:00:00.000Z"),
      },
      {
        sourceType: "suppliers",
        synced: false,
        recordCount: 0,
        latestSyncedAt: null,
      },
    ])
    assert.equal(result.selectedSourcesWithDataCount, 2)
    assert.equal(result.selectedSourcesWithoutDataCount, 1)
  })

  test("status readiness uses selected source expectations", async () => {
    enabledSourceTypes = ["bills", "suppliers"]
    mockDbState.latestBillSyncAt = new Date()
    mockDbState.latestSupplierSyncAt = null
    mockDbState.latestTxnSyncAt = new Date()

    const result = await loadSpendLeakDashboard("user-1")

    assert.deepEqual(result.enabledSourceTypes, ["bills", "suppliers"])
    assert.equal(result.expectedSourceCount, 2)
    assert.equal(result.syncedExpectedSourceCount, 1)
    assert.equal(result.status.state, "partial_data")
  })

  test("returns bank-only selected-source coverage when synced with zero findings", async () => {
    enabledSourceTypes = ["bank_transactions"]
    mockDbState.findings = []
    mockDbState.latestBillSyncAt = null
    mockDbState.latestTxnSyncAt = new Date()
    mockDbState.latestSupplierSyncAt = null
    mockDbState.billRecordCount = 0
    mockDbState.bankTransactionRecordCount = 24
    mockDbState.supplierRecordCount = 0

    const result = await loadSpendLeakDashboard("user-1")

    assert.equal(result.status.state, "empty")
    assert.deepEqual(result.enabledSourceTypes, ["bank_transactions"])
    assert.equal(result.expectedSourceCount, 1)
    assert.equal(result.syncedExpectedSourceCount, 1)
    assert.equal(result.selectedSourceCoverage.length, 1)
    assert.equal(result.selectedSourceCoverage[0]?.sourceType, "bank_transactions")
    assert.equal(result.selectedSourceCoverage[0]?.synced, true)
    assert.equal(result.selectedSourceCoverage[0]?.recordCount, 24)
    assert.equal(result.selectedSourceCoverage[0]?.latestSyncedAt instanceof Date, true)
    assert.equal(result.selectedSourcesWithDataCount, 1)
    assert.equal(result.selectedSourcesWithoutDataCount, 0)
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