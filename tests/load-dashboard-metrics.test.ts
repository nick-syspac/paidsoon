import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import { loadDashboardMetricsWithTx } from "@/lib/dashboard/loadDashboardMetrics"
import type { PrismaTx } from "@/lib/db/withUserContext"

afterEach(() => {
  mock.restoreAll()
})

function makeTx(paidRows: unknown[]): PrismaTx {
  return {
    trackedInvoice: {
      findMany: async () => paidRows,
      count: async ({ where }: { where: { status: string } }) =>
        where.status === "paid" ? paidRows.length : 0,
    },
    emailLog: {
      count: async () => 0,
    },
  } as unknown as PrismaTx
}

test("skips paid tracked invoices whose financial invoice relation is missing", async () => {
  const error = mock.method(console, "error", () => undefined)
  const tx = makeTx([
    {
      id: "paid-broken",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-02T00:00:00Z"),
      financialInvoice: null,
    },
    {
      id: "paid-valid",
      createdAt: new Date("2026-09-03T00:00:00Z"),
      updatedAt: new Date("2026-09-04T00:00:00Z"),
      financialInvoice: {
        amountDueCents: 4200,
        currency: "aud",
        contact: {
          name: "Valid Client",
          email: "client@example.com",
        },
      },
    },
  ])

  const result = await loadDashboardMetricsWithTx(tx, "user-1", new Date("2026-09-05T00:00:00Z"))

  assert.equal(result.paidInvoices.length, 1)
  assert.equal(result.paidInvoices[0]?.id, "paid-valid")
  assert.equal(result.paidInvoices[0]?.clientEmail, "client@example.com")
  assert.equal(error.mock.callCount(), 1)
  assert.deepEqual(error.mock.calls[0]?.arguments, [
    "Skipping paid invoices missing financial invoice relation",
    { missingCount: 1, trackedInvoiceIds: ["paid-broken"] },
  ])
})