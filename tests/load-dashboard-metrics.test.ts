import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"
import { loadDashboardMetricsWithTx } from "@/lib/dashboard/loadDashboardMetrics"
import type { PrismaTx } from "@/lib/db/withUserContext"

afterEach(() => {
  mock.restoreAll()
})

function makeTx(rows: Array<Record<string, unknown>>): PrismaTx {
  return {
    trackedInvoice: {
      findMany: async ({ where }: { where?: { status?: string | { in: string[] }; userId?: string; updatedAt?: { gte: Date } } } = {}) => {
        const filtered = where?.status && typeof where.status === "object" && "in" in where.status
          ? rows.filter((row) => where.status.in.includes(String(row.status ?? "paid")))
          : where?.status === "paid"
            ? rows.filter((row) => row.status === undefined || row.status === "paid")
            : rows
        return filtered.sort((a, b) => Number(new Date(b.updatedAt ?? b.createdAt ?? 0)) - Number(new Date(a.updatedAt ?? a.createdAt ?? 0)))
      },
      count: async ({ where }: { where: { status: string } }) =>
        where.status === "paid" ? rows.filter((row) => row.status === undefined || row.status === "paid").length : 0,
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

test("counts only eligible paid and resolved invoices against the active account display cutoff", async () => {
  const tx = makeTx([
    {
      id: "old-paid",
      createdAt: new Date("2026-08-01T00:00:00Z"),
      updatedAt: new Date("2026-09-04T00:00:00Z"),
      status: "paid",
      financialInvoice: {
        amountDueCents: 4200,
        currency: "aud",
        issueDate: new Date("2026-07-15T00:00:00Z"),
        dueDate: new Date("2026-07-20T00:00:00Z"),
        contact: {
          name: "Old Client",
          email: "old@example.com",
        },
      },
    },
    {
      id: "new-paid",
      createdAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-05T00:00:00Z"),
      status: "paid",
      financialInvoice: {
        amountDueCents: 7600,
        currency: "aud",
        issueDate: new Date("2026-09-02T00:00:00Z"),
        dueDate: new Date("2026-09-10T00:00:00Z"),
        contact: {
          name: "New Client",
          email: "new@example.com",
        },
      },
    },
    {
      id: "old-resolved",
      createdAt: new Date("2026-08-20T00:00:00Z"),
      updatedAt: new Date("2026-09-04T00:00:00Z"),
      status: "manually_resolved",
      financialInvoice: {
        amountDueCents: 2000,
        currency: "aud",
        issueDate: new Date("2026-07-15T00:00:00Z"),
        dueDate: new Date("2026-07-20T00:00:00Z"),
        contact: {
          name: "Resolved Client",
          email: "resolved@example.com",
        },
      },
    },
  ])

  const result = await loadDashboardMetricsWithTx(
    tx,
    "user-1",
    new Date("2026-09-05T00:00:00Z"),
    new Date("2026-09-01T00:00:00Z"),
  )

  assert.equal(result.paidInvoices.length, 2)
  assert.equal(result.paidInvoices[0]?.id, "new-paid")
  assert.equal(result.paidCountAllTime, 1)
  assert.equal(result.manuallyResolvedCountAllTime, 0)
})