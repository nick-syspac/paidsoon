import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import { loadDashboardInvoicesWithTx } from "@/lib/dashboard/loadDashboardInvoices"
import { loadBrokenPromiseCountsByDebtorWithTx } from "@/lib/dashboard/loadDashboardRiskSignals"
import { loadDisputedInvoiceCountWithTx } from "@/lib/dashboard/needsAttentionSignals"
import type { PrismaTx } from "@/lib/db/withUserContext"

afterEach(() => {
  mock.restoreAll()
})

function makeTx(trackedInvoices: unknown[]): PrismaTx {
  return {
    trackedInvoice: {
      findMany: async () => trackedInvoices,
    },
    emailLog: {
      findMany: async () => [],
    },
    promiseToPay: {
      findMany: async () => [],
    },
    arrangementInvoiceCoverage: {
      findMany: async () => [],
    },
    invoicePayment: {
      findMany: async () => [],
    },
    arrangement: {
      findMany: async () => [],
    },
  } as unknown as PrismaTx
}

test("skips tracked invoices whose financial invoice relation is missing", async () => {
  const error = mock.method(console, "error", () => undefined)
  const tx = makeTx([
    {
      id: "tracked-broken",
      userId: "user-1",
      financialInvoiceId: "fin-broken",
      invoiceConnectionId: "conn-1",
      customerId: null,
      status: "pending",
      currentStage: 0,
      nextEmailAt: null,
      snoozedUntil: null,
      firstChasedAt: null,
      providerMetadata: null,
      p2pToken: null,
      disputeNote: null,
      disputeRaisedAt: null,
      disputeResolvedAt: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-02T00:00:00Z"),
      financialInvoice: null,
    },
    {
      id: "tracked-valid",
      userId: "user-1",
      financialInvoiceId: "fin-valid",
      invoiceConnectionId: "conn-1",
      customerId: null,
      status: "pending",
      currentStage: 1,
      nextEmailAt: null,
      snoozedUntil: null,
      firstChasedAt: null,
      providerMetadata: null,
      p2pToken: null,
      disputeNote: null,
      disputeRaisedAt: null,
      disputeResolvedAt: null,
      createdAt: new Date("2026-09-03T00:00:00Z"),
      updatedAt: new Date("2026-09-04T00:00:00Z"),
      financialInvoice: {
        id: "fin-valid",
        userId: "user-1",
        sourceSystem: "csv",
        sourceId: "inv-001",
        sourceUpdatedAt: null,
        syncedAt: new Date("2026-09-03T00:00:00Z"),
        accountingConnectionId: null,
        contactId: "contact-1",
        invoiceNumber: "INV-001",
        amountDueCents: 4200,
        currency: "aud",
        dueDate: new Date("2026-09-20T00:00:00Z"),
        issueDate: null,
        paymentUrl: null,
        rawSourceData: null,
        createdAt: new Date("2026-09-03T00:00:00Z"),
        updatedAt: new Date("2026-09-04T00:00:00Z"),
        contact: {
          id: "contact-1",
          userId: "user-1",
          sourceSystem: "csv",
          sourceId: "contact-1",
          sourceUpdatedAt: null,
          syncedAt: new Date("2026-09-03T00:00:00Z"),
          accountingConnectionId: null,
          name: "Valid Client",
          email: "client@example.com",
          emailLower: "client@example.com",
          rawSourceData: null,
          createdAt: new Date("2026-09-03T00:00:00Z"),
          updatedAt: new Date("2026-09-04T00:00:00Z"),
        },
      },
    },
  ])

  const result = await loadDashboardInvoicesWithTx(tx, "user-1", ["pending"], { updatedAt: "desc" })

  assert.equal(result.length, 1)
  assert.equal(result[0]?.id, "tracked-valid")
  assert.equal(result[0]?.clientEmail, "client@example.com")
  assert.equal(error.mock.callCount(), 1)
  assert.deepEqual(error.mock.calls[0]?.arguments, [
    "Skipping tracked invoices missing financial invoice relation",
    { missingCount: 1, trackedInvoiceIds: ["tracked-broken"] },
  ])
})

test("excludes invoices older than the account display cutoff", async () => {
  const tx = makeTx([
    {
      id: "tracked-old",
      userId: "user-1",
      financialInvoiceId: "fin-old",
      invoiceConnectionId: "conn-1",
      customerId: null,
      status: "pending",
      currentStage: 0,
      nextEmailAt: null,
      snoozedUntil: null,
      firstChasedAt: null,
      providerMetadata: null,
      p2pToken: null,
      disputeNote: null,
      disputeRaisedAt: null,
      disputeResolvedAt: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-02T00:00:00Z"),
      financialInvoice: {
        id: "fin-old",
        userId: "user-1",
        sourceSystem: "csv",
        sourceId: "inv-old",
        sourceUpdatedAt: null,
        syncedAt: new Date("2026-09-01T00:00:00Z"),
        accountingConnectionId: null,
        contactId: "contact-1",
        invoiceNumber: "OLD-INV",
        amountDueCents: 3200,
        currency: "aud",
        dueDate: new Date("2026-08-15T00:00:00Z"),
        issueDate: new Date("2026-08-10T00:00:00Z"),
        paymentUrl: null,
        rawSourceData: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        updatedAt: new Date("2026-09-02T00:00:00Z"),
        contact: {
          id: "contact-1",
          userId: "user-1",
          sourceSystem: "csv",
          sourceId: "contact-1",
          sourceUpdatedAt: null,
          syncedAt: new Date("2026-09-01T00:00:00Z"),
          accountingConnectionId: null,
          name: "Old Client",
          email: "old@example.com",
          emailLower: "old@example.com",
          rawSourceData: null,
          createdAt: new Date("2026-09-01T00:00:00Z"),
          updatedAt: new Date("2026-09-02T00:00:00Z"),
        },
      },
    },
    {
      id: "tracked-new",
      userId: "user-1",
      financialInvoiceId: "fin-new",
      invoiceConnectionId: "conn-1",
      customerId: null,
      status: "pending",
      currentStage: 1,
      nextEmailAt: null,
      snoozedUntil: null,
      firstChasedAt: null,
      providerMetadata: null,
      p2pToken: null,
      disputeNote: null,
      disputeRaisedAt: null,
      disputeResolvedAt: null,
      createdAt: new Date("2026-09-03T00:00:00Z"),
      updatedAt: new Date("2026-09-04T00:00:00Z"),
      financialInvoice: {
        id: "fin-new",
        userId: "user-1",
        sourceSystem: "csv",
        sourceId: "inv-new",
        sourceUpdatedAt: null,
        syncedAt: new Date("2026-09-03T00:00:00Z"),
        accountingConnectionId: null,
        contactId: "contact-2",
        invoiceNumber: "NEW-INV",
        amountDueCents: 4800,
        currency: "aud",
        dueDate: new Date("2026-09-20T00:00:00Z"),
        issueDate: new Date("2026-09-01T00:00:00Z"),
        paymentUrl: null,
        rawSourceData: null,
        createdAt: new Date("2026-09-03T00:00:00Z"),
        updatedAt: new Date("2026-09-04T00:00:00Z"),
        contact: {
          id: "contact-2",
          userId: "user-1",
          sourceSystem: "csv",
          sourceId: "contact-2",
          sourceUpdatedAt: null,
          syncedAt: new Date("2026-09-03T00:00:00Z"),
          accountingConnectionId: null,
          name: "New Client",
          email: "new@example.com",
          emailLower: "new@example.com",
          rawSourceData: null,
          createdAt: new Date("2026-09-03T00:00:00Z"),
          updatedAt: new Date("2026-09-04T00:00:00Z"),
        },
      },
    },
  ])

  const result = await loadDashboardInvoicesWithTx(
    tx,
    "user-1",
    ["pending"],
    { updatedAt: "desc" },
    new Date("2026-09-01T00:00:00Z"),
  )

  assert.equal(result.length, 1)
  assert.equal(result[0]?.id, "tracked-new")
  assert.equal(result[0]?.clientEmail, "new@example.com")
})

test("keeps recent cash receipts independent from an excluded invoice cutoff", async () => {
  const cutoffDate = new Date("2026-09-01T00:00:00Z")
  const tx = {
    trackedInvoice: {
      findMany: async ({ where }) => {
        if (where?.status === "paid") {
          return [
            {
              id: "tracked-old-paid",
              status: "paid",
              createdAt: new Date("2026-08-20T00:00:00Z"),
              updatedAt: new Date("2026-09-03T00:00:00Z"),
              financialInvoice: {
                amountDueCents: 5000,
                currency: "aud",
                issueDate: new Date("2026-08-15T00:00:00Z"),
                dueDate: new Date("2026-08-20T00:00:00Z"),
                contact: { name: "Old Client", email: "old@example.com" },
              },
            },
          ]
        }
        return []
      },
    },
    invoicePayment: {
      findMany: async () => [
        {
          trackedInvoiceId: "tracked-old-paid",
          userId: "user-1",
          amount: 5000,
          currency: "aud",
          source: "import_reconciliation",
          note: null,
          recordedAt: new Date("2026-09-03T00:00:00Z"),
          createdAt: new Date("2026-09-03T00:00:00Z"),
          trackedInvoice: {
            id: "tracked-old-paid",
            createdAt: new Date("2026-08-20T00:00:00Z"),
            financialInvoice: {
              amountDueCents: 5000,
              currency: "aud",
              issueDate: new Date("2026-08-15T00:00:00Z"),
              dueDate: new Date("2026-08-20T00:00:00Z"),
              contact: { name: "Old Client", email: "old@example.com" },
            },
          },
        },
      ],
    },
    emailLog: { count: async () => 0, findMany: async () => [] },
  } as unknown as PrismaTx

  const result = await (await import("@/lib/dashboard/loadDashboardMetrics")).loadDashboardMetricsWithTx(
    tx,
    "user-1",
    new Date("2026-09-03T00:00:00Z"),
    cutoffDate,
  )

  assert.equal(result.paidCountAllTime, 0)
  assert.equal(result.paidInvoices.length, 1)
  assert.equal(result.paidInvoices[0]?.clientEmail, "old@example.com")
  assert.equal(result.paidInvoices[0]?.updatedAt.toISOString(), "2026-09-03T00:00:00.000Z")
})

test("excludes old broken promises and disputed invoices from dashboard summary counts", async () => {
  const cutoffDate = new Date("2026-09-01T00:00:00Z")
  const tx = {
    promiseToPay: {
      findMany: async () => [
        {
          trackedInvoice: {
            financialInvoice: {
              contact: { email: "old@example.com" },
              issueDate: new Date("2026-08-10T00:00:00Z"),
              dueDate: null,
            },
          },
        },
        {
          trackedInvoice: {
            financialInvoice: {
              contact: { email: "new@example.com" },
              issueDate: new Date("2026-09-03T00:00:00Z"),
              dueDate: null,
            },
          },
        },
      ],
    },
    trackedInvoice: {
      count: async ({ where }) => {
        if (where?.status === "disputed") {
          return 2
        }
        return 0
      },
      findMany: async () => [
        { financialInvoice: { issueDate: new Date("2026-08-10T00:00:00Z"), dueDate: null } },
        { financialInvoice: { issueDate: new Date("2026-09-03T00:00:00Z"), dueDate: null } },
      ],
    },
  } as unknown as PrismaTx

  const brokenPromises = await loadBrokenPromiseCountsByDebtorWithTx(tx, "user-1", cutoffDate)
  const disputedCount = await loadDisputedInvoiceCountWithTx(tx, "user-1", cutoffDate)

  assert.deepEqual(brokenPromises, { "new@example.com": 1 })
  assert.equal(disputedCount, 1)
})