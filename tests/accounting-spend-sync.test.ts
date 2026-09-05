import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

type MockSpendBill = {
  providerBillId: string
  supplierName: string
  amountTotal: number
  currency: string
  status: "open"
}

type MockSpendBankTransaction = {
  providerTransactionId: string
  description: string
  amount: number
  currency: string
  transactionDate: Date
}

type MockSpendSupplier = {
  providerSupplierId: string
  supplierName: string
}

let providerName: "xero" | "myob" = "xero"
let spendBills: MockSpendBill[] = []
let spendTransactions: MockSpendBankTransaction[] = []
let spendSuppliers: MockSpendSupplier[] = []

const upsertBillKeys = new Set<string>()
const upsertTxnKeys = new Set<string>()
const upsertSupplierKeys = new Set<string>()
const upsertFindingKeys = new Set<string>()

let syncConnection: ((connectionId: string) => Promise<{
  status: string
  spendBillsUpserted: number
  spendTransactionsUpserted: number
  spendSuppliersUpserted: number
}>) | null = null

describe("accounting spend sync orchestration", () => {
  before(async () => {
    await mock.module("@/lib/db/customers", {
      namedExports: {
        findOrCreateCustomer: async () => null,
      },
    })

    await mock.module("@/lib/financial/ingest", {
      namedExports: {
        upsertFinancialContact: async () => ({ id: "contact-1" }),
        upsertFinancialInvoice: async () => ({
          invoice: { id: "invoice-1" },
          created: false,
        }),
      },
    })

    await mock.module("@/lib/providers/accounting/demoGuard", {
      namedExports: {
        isDemoOrganisationId: () => false,
      },
    })

    await mock.module("@/lib/providers/accounting/crypto", {
      namedExports: {
        decryptToken: (value: string) => value,
        encryptToken: (value: string) => value,
      },
    })

    await mock.module("@/lib/providers/accounting", {
      namedExports: {
        getAccountingProvider: () => ({
          refreshTokens: async () => ({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 }),
          getInvoices: async () => [],
          getContacts: async () => [],
          getSpendBills: async () => spendBills,
          getSpendBankTransactions: async () => spendTransactions,
          getSpendSuppliers: async () => spendSuppliers,
          getSpendExpenseAccounts: async () => [],
        }),
      },
    })

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          accountingSyncRun: {
            findFirst: async () => null,
            create: async () => ({ id: "sync-run-1" }),
            update: async () => null,
          },
          accountingConnection: {
            findUnique: async () => ({
              id: "conn-1",
              userId: "user-1",
              provider: providerName,
              organisationId: "org-1",
              organisationName: "Org",
              encryptedAccessToken: "at",
              encryptedRefreshToken: "rt",
              tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
              lastSyncedAt: new Date("2026-09-01T00:00:00.000Z"),
              status: "active",
            }),
            update: async () => null,
          },
          invoiceConnection: {
            findFirst: async () => ({ id: "invoice-conn-1" }),
            create: async () => ({ id: "invoice-conn-1" }),
          },
          importedBill: {
            upsert: async (args: { where: { accountingConnectionId_sourceId: { accountingConnectionId: string; sourceId: string } } }) => {
              const key = `${args.where.accountingConnectionId_sourceId.accountingConnectionId}:${args.where.accountingConnectionId_sourceId.sourceId}`
              upsertBillKeys.add(key)
              return null
            },
          },
          importedBankTransaction: {
            upsert: async (args: { where: { accountingConnectionId_sourceId: { accountingConnectionId: string; sourceId: string } } }) => {
              const key = `${args.where.accountingConnectionId_sourceId.accountingConnectionId}:${args.where.accountingConnectionId_sourceId.sourceId}`
              upsertTxnKeys.add(key)
              return null
            },
          },
          supplierProfile: {
            upsert: async (args: { where: { accountingConnectionId_sourceId: { accountingConnectionId: string; sourceId: string } } }) => {
              const key = `${args.where.accountingConnectionId_sourceId.accountingConnectionId}:${args.where.accountingConnectionId_sourceId.sourceId}`
              upsertSupplierKeys.add(key)
              return null
            },
          },
          spendInsight: {
            upsert: async (args: { where: { userId_findingType_subjectKey: { userId: string; findingType: string; subjectKey: string } } }) => {
              const key = args.where.userId_findingType_subjectKey
              upsertFindingKeys.add(`${key.userId}:${key.findingType}:${key.subjectKey}`)
              return null
            },
          },
          cashForecastSnapshot: {
            findFirst: async () => ({ currentCashCents: 300000 }),
          },
          financialInvoice: {
            aggregate: async () => ({ _sum: { amountDueCents: 120000 } }),
          },
        },
      },
    })

    const syncModule = await import("@/lib/providers/accounting/sync")
    syncConnection = syncModule.syncConnection
  })

  beforeEach(() => {
    upsertBillKeys.clear()
    upsertTxnKeys.clear()
    upsertSupplierKeys.clear()
    upsertFindingKeys.clear()

    spendBills = [
      {
        providerBillId: "bill-1",
        supplierName: providerName === "xero" ? "Xero Supplier" : "MYOB Supplier",
        amountTotal: 199,
        currency: "AUD",
        status: "open",
      },
    ]
    spendTransactions = [
      {
        providerTransactionId: "txn-1",
        description: providerName === "xero" ? "Xero spend" : "MYOB spend",
        amount: -199,
        currency: "AUD",
        transactionDate: new Date("2026-09-01T00:00:00.000Z"),
      },
    ]
    spendSuppliers = [
      {
        providerSupplierId: "sup-1",
        supplierName: providerName === "xero" ? "Xero Supplier" : "MYOB Supplier",
      },
    ]
  })

  test("upserts spend-side records inside the existing sync cadence", async () => {
    providerName = "xero"
    const result = await syncConnection?.("conn-1")

    assert.ok(result)
    assert.equal(result?.status, "success")
    assert.equal(result?.spendBillsUpserted, 1)
    assert.equal(result?.spendTransactionsUpserted, 1)
    assert.equal(result?.spendSuppliersUpserted, 1)
    assert.equal(upsertBillKeys.size, 1)
    assert.equal(upsertTxnKeys.size, 1)
    assert.equal(upsertSupplierKeys.size, 1)
    assert.equal(upsertFindingKeys.size > 0, true)
  })

  test("remains idempotent for repeated sync windows using stable upsert keys", async () => {
    providerName = "myob"

    const first = await syncConnection?.("conn-1")
    const second = await syncConnection?.("conn-1")

    assert.ok(first)
    assert.ok(second)
    assert.equal(first?.status, "success")
    assert.equal(second?.status, "success")
    // Two runs with same source IDs still keep one logical record key per dataset.
    assert.equal(upsertBillKeys.size, 1)
    assert.equal(upsertTxnKeys.size, 1)
    assert.equal(upsertSupplierKeys.size, 1)
    assert.equal(upsertFindingKeys.size > 0, true)
  })
})
