import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import { resolveEffectiveAccess, type EffectiveAccessSnapshot } from "@/lib/billing/effectiveAccess"
import { detectionSqlAdapter, type DetectionWork } from "@/tests/helpers/commitGuardDetection"
import { requestCommitGuardDetection } from "@/lib/commitguard/detectionRequest"
import type { PrismaTx } from "@/lib/db/withUserContext"

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
  direction: "outflow" | "inflow" | "unknown"
  accountName?: string
  accountCode?: string
  expenseAccountName?: string
  expenseAccountCode?: string
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
const persistedSpendTransactions: Array<Record<string, unknown>> = []
const classificationHandoffs: Array<{ userId: string; sourceType: string; sourceRecordId: string }> = []
const upsertSupplierKeys = new Set<string>()
const upsertFindingKeys = new Set<string>()
let classificationHandoffFails = false
let accessFacts: EffectiveAccessSnapshot
let analysisReads = 0
const detectionWork = new Map<string, DetectionWork>()
let completedRun: { id: string; userId: string; status: string; completedAt: Date | null; invoicesSkipped: number } | null = null
let detectionInsertFails = false
let completionFails = false
let transactionCommitFails = false
let invoiceFetchFails = false
let spendWriteFails = false
let detectionCalls = 0
let runId = "sync-run-1"

function completionTx(): PrismaTx {
  return {
    ...detectionSqlAdapter(detectionWork, () => detectionInsertFails),
    accountingSyncRun: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (completionFails) throw new Error("mock source completion failure")
        completedRun = { id: runId, userId: "user-1", ...data } as typeof completedRun
        return completedRun
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return completedRun && completedRun.id === where.id && completedRun.userId === where.userId
          && completedRun.status === "success" && completedRun.completedAt && completedRun.invoicesSkipped === 0
          ? { id: completedRun.id } : null
      },
    },
  } as unknown as PrismaTx
}

let syncConnection: ((connectionId: string) => Promise<{
  status: string
  errorMessage?: string
  spendBillsUpserted: number
  spendTransactionsUpserted: number
  spendSuppliersUpserted: number
  spendAnalysisSkip?: { status: string; reason: string }
}>) | null = null

describe("accounting spend sync orchestration", () => {
  before(async () => {
    await mock.module("@/lib/commitguard/detection", { namedExports: {
      detectCommitmentCandidates: async () => { detectionCalls++; throw new Error("detector must not execute during ingestion") },
    } })
    await mock.module("@/lib/billing/effectiveAccessSystem", { namedExports: {
      getEffectiveAccessForSystem: async () => resolveEffectiveAccess(accessFacts, new Date()),
    } })
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

    await mock.module("@/lib/spendClassification/handoff", {
      namedExports: {
        handoffImportedSpendForClassification: async (userId: string, sourceType: string, sourceRecordId: string) => {
          classificationHandoffs.push({ userId, sourceType, sourceRecordId })
          if (classificationHandoffFails) throw new Error("classification unavailable")
        },
      },
    })

    await mock.module("@/lib/providers/accounting", {
      namedExports: {
        getAccountingProvider: () => ({
          refreshTokens: async () => ({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 }),
          getInvoices: async () => { if (invoiceFetchFails) throw new Error("mock provider failure"); return [] },
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
          $transaction: async (fn: (tx: PrismaTx) => Promise<unknown>) => {
            const previousRun = structuredClone(completedRun)
            const previousWork = structuredClone(detectionWork)
            try {
              const result = await fn(completionTx())
              if (transactionCommitFails) throw new Error("mock commit failure")
              return result
            } catch (error) {
              completedRun = previousRun
              detectionWork.clear()
              for (const [key, value] of previousWork) detectionWork.set(key, value)
              throw error
            }
          },
          accountingSyncRun: {
            findFirst: async () => null,
            create: async () => ({ id: runId }),
            update: async () => null,
          },
          accountingConnection: {
            findUnique: async () => ({
              id: "conn-1",
              userId: "user-1",
              provider: providerName,
              scopes:
                providerName === "myob"
                  ? "sme-sales sme-contacts-customer sme-company-file sme-purchases sme-banking sme-general-ledger sme-contacts-supplier"
                  : "accounting.transactions accounting.contacts",
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
              if (spendWriteFails) throw new Error("mock bill persistence failure")
              const key = `${args.where.accountingConnectionId_sourceId.accountingConnectionId}:${args.where.accountingConnectionId_sourceId.sourceId}`
              upsertBillKeys.add(key)
              return { id: "db-bill-1" }
            },
          },
            importedBankTransaction: {
              upsert: async (args: {
                where: { accountingConnectionId_sourceId: { accountingConnectionId: string; sourceId: string } }
                create: Record<string, unknown>
              }) => {
              const key = `${args.where.accountingConnectionId_sourceId.accountingConnectionId}:${args.where.accountingConnectionId_sourceId.sourceId}`
              upsertTxnKeys.add(key)
                persistedSpendTransactions.push(args.create)
              return { id: "db-transaction-1" }
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
            findUnique: async () => null,
            create: async (args: { data: { userId: string; findingType: string; subjectKey: string } }) => {
              const key = args.data
              upsertFindingKeys.add(`${key.userId}:${key.findingType}:${key.subjectKey}`)
              return null
            },
            update: async (args: { where: { id: string }; data: { userId?: string; findingType?: string; subjectKey?: string } }) => {
              const key = args.data
              if (key.userId && key.findingType && key.subjectKey) {
                upsertFindingKeys.add(`${key.userId}:${key.findingType}:${key.subjectKey}`)
              }
              return null
            },
          },
          cashForecastSnapshot: {
            findFirst: async () => { analysisReads += 1; return { currentCashCents: 300000 } },
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
    accessFacts = {
      profile: { subscriptionStatus: "canceled", subscriptionTier: "essentials", stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 0 },
      grant: { plan: "small_business", startsAt: new Date(0), expiresAt: new Date("2099-01-01"), revokedAt: null },
      billingRisks: [],
    }
    analysisReads = 0
    detectionWork.clear()
    completedRun = null
    detectionInsertFails = false
    completionFails = false
    transactionCommitFails = false
    invoiceFetchFails = false
    spendWriteFails = false
    detectionCalls = 0
    runId = "sync-run-1"
    upsertBillKeys.clear()
    upsertTxnKeys.clear()
    persistedSpendTransactions.length = 0
    classificationHandoffs.length = 0
    classificationHandoffFails = false
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
        amount: 199,
        direction: "outflow",
        accountName: "Main Bank",
        accountCode: "090",
        expenseAccountName: "Software subscriptions",
        expenseAccountCode: "620",
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
    assert.equal(persistedSpendTransactions[0]?.amountCents, 19900)
    assert.equal(persistedSpendTransactions[0]?.direction, "outflow")
    assert.equal(persistedSpendTransactions[0]?.accountName, "Main Bank")
    assert.equal(persistedSpendTransactions[0]?.accountCode, "090")
    assert.equal(persistedSpendTransactions[0]?.expenseAccountName, "Software subscriptions")
    assert.equal(persistedSpendTransactions[0]?.expenseAccountCode, "620")
    assert.equal(upsertSupplierKeys.size, 1)
    assert.equal(upsertFindingKeys.size > 0, true)
    assert.deepEqual(classificationHandoffs, [
      { userId: "user-1", sourceType: "imported_bill", sourceRecordId: "db-bill-1" },
      { userId: "user-1", sourceType: "imported_bank_transaction", sourceRecordId: "db-transaction-1" },
    ])
  })

  test("classification handoff failure does not fail provider spend import", async () => {
    providerName = "xero"
    classificationHandoffFails = true

    const result = await syncConnection?.("conn-1")

    assert.ok(result)
    assert.equal(result?.status, "success")
    assert.equal(result?.spendBillsUpserted, 1)
    assert.equal(result?.spendTransactionsUpserted, 1)
    assert.equal(result?.errorMessage, undefined)
    assert.equal(classificationHandoffs.length, 2)
    assert.equal(detectionWork.size, 1)
  })

  test("successful completion persists one pending source identity without executing detection; replay preserves failed generations", async () => {
    await syncConnection!("conn-1")
    assert.equal(completedRun?.status, "success")
    const work = [...detectionWork.values()][0]
    assert.deepEqual(work, {
      userId: "user-1", kind: "detect", dedupeKey: "detection:accounting_sync_run:sync-run-1",
      sourceKind: "accounting_sync_run", sourceId: "sync-run-1", calculationRevision: 0,
      state: "pending", attempts: 0, generation: 0,
    })
    work.state = "failed"
    work.attempts = 6
    work.generation = 2
    assert.equal(await requestCommitGuardDetection(completionTx(), "user-1", {
      sourceKind: "accounting_sync_run", sourceId: "sync-run-1",
    }), false)
    assert.equal(detectionWork.size, 1)
    assert.equal(work.attempts, 6)
    assert.equal(work.generation, 2)
    assert.equal(detectionCalls, 0)
  })

  test("work persistence failure leaves committed successful run recoverable after a crash, using the same idempotent helper", async () => {
    detectionInsertFails = true
    assert.equal((await syncConnection!("conn-1")).status, "success")
    assert.equal(completedRun?.status, "success")
    assert.equal(detectionWork.size, 0)
    detectionInsertFails = false
    const source = { sourceKind: "accounting_sync_run", sourceId: "sync-run-1" } as const
    assert.equal(await requestCommitGuardDetection(completionTx(), "other-user", source), false)
    assert.equal(await requestCommitGuardDetection(completionTx(), "user-1", source), true)
    assert.equal(await requestCommitGuardDetection(completionTx(), "user-1", source), false)
    assert.equal(detectionWork.size, 1)
    assert.equal(detectionCalls, 0)
  })

  for (const failure of ["partial", "failed", "completion", "commit"] as const) {
    test(`${failure} source leaves no orphan detection work`, async () => {
      spendWriteFails = failure === "partial"
      invoiceFetchFails = failure === "failed"
      completionFails = failure === "completion"
      transactionCommitFails = failure === "commit"
      if (completionFails || transactionCommitFails) await assert.rejects(() => syncConnection!("conn-1"), /mock .*failure/)
      else assert.equal((await syncConnection!("conn-1")).status, failure)
      assert.equal(detectionWork.size, 0)
      if (completionFails || transactionCommitFails) assert.equal(completedRun, null)
      assert.equal(await requestCommitGuardDetection(completionTx(), "user-1", { sourceKind: "accounting_sync_run", sourceId: "sync-run-1" }), false)
    })
  }

  test("remains idempotent for repeated sync windows using stable upsert keys", async () => {
    providerName = "myob"

    const first = await syncConnection?.("conn-1")
    runId = "sync-run-2"
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
    // Work identity is a successful run, not an evidence window or connection.
    assert.equal(detectionWork.size, 2)
  })

  for (const mode of ["expired", "revoked", "restricted", "feature"] as const) {
    test(`${mode} access skips SpendLeak analysis but retains ingestion, classification handoff and operational sync success`, async () => {
      if (mode === "expired") accessFacts.grant!.expiresAt = new Date(0)
      if (mode === "revoked") accessFacts.grant!.revokedAt = new Date()
      if (mode === "restricted") accessFacts.profile!.subscriptionStatus = "unpaid"
      if (mode === "feature") accessFacts.grant!.plan = "business_pro"
      const result = await syncConnection?.("conn-1")
      assert.equal(result?.status, "success")
      assert.deepEqual(result?.spendAnalysisSkip, { status: "skipped", reason: mode === "feature" ? "feature_not_available" : "no_access" })
      assert.equal(analysisReads, 0)
      assert.equal(upsertFindingKeys.size, 0)
      assert.equal(upsertBillKeys.size, 1)
      assert.equal(upsertTxnKeys.size, 1)
      assert.equal(classificationHandoffs.length, 2)
      assert.equal(detectionWork.size, 1)
      assert.equal(detectionCalls, 0)
    })
  }
})
