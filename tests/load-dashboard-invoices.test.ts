import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import { loadDashboardInvoicesWithTx } from "@/lib/dashboard/loadDashboardInvoices"
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