import test from "node:test"
import assert from "node:assert/strict"
import { buildCurrencyDashboardSummaries } from "@/lib/dashboard/currencySummary"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"

function makeActiveInvoice(overrides: Partial<InvoiceWithRelations> & { id: string }): InvoiceWithRelations {
  return {
    userId: "user-1",
    invoiceConnectionId: "conn-1",
    customerId: null,
    externalId: `ext-${overrides.id}`,
    provider: "stripe",
    clientEmail: overrides.clientEmail ?? "client@example.com",
    clientName: overrides.clientName ?? "Client",
    amountDue: overrides.amountDue ?? 1000,
    currency: overrides.currency ?? "usd",
    dueDate: overrides.dueDate ?? new Date("2026-08-01T00:00:00Z"),
    paymentUrl: null,
    status: (overrides.status ?? "pending") as InvoiceWithRelations["status"],
    currentStage: overrides.currentStage ?? 0,
    nextEmailAt: null,
    snoozedUntil: null,
    firstChasedAt: null,
    providerMetadata: null,
    p2pToken: null,
    disputeNote: null,
    disputeRaisedAt: null,
    disputeResolvedAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    emailLogs: [],
    promisesToPay: [],
    arrangementCoverages: [],
    payments: [],
    ...overrides,
  }
}

function makePaidInvoice(overrides: Partial<PaidInvoiceSummary> & { id: string }): PaidInvoiceSummary {
  return {
    clientEmail: overrides.clientEmail ?? "client@example.com",
    clientName: overrides.clientName ?? "Client",
    amountDue: overrides.amountDue ?? 1000,
    currency: overrides.currency ?? "usd",
    createdAt: overrides.createdAt ?? new Date("2026-07-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-08-02T00:00:00Z"),
    ...overrides,
  }
}

test("buildCurrencyDashboardSummaries keeps mixed-currency totals separate", () => {
  const summaries = buildCurrencyDashboardSummaries({
    activeInvoices: [
      makeActiveInvoice({ id: "usd-active-1", clientEmail: "usd@example.com", amountDue: 3000, currency: "usd" }),
      makeActiveInvoice({ id: "aud-active-1", clientEmail: "aud@example.com", amountDue: 4500, currency: "aud" }),
      makeActiveInvoice({ id: "usd-active-2", clientEmail: "usd@example.com", amountDue: 2000, currency: "usd" }),
    ],
    paidInvoices: [
      makePaidInvoice({ id: "usd-paid-1", clientEmail: "usd@example.com", amountDue: 1500, currency: "usd" }),
      makePaidInvoice({ id: "aud-paid-1", clientEmail: "aud@example.com", amountDue: 1000, currency: "aud" }),
    ],
    displayName: "Alex",
    brokenPromiseCountsByDebtor: {},
    paidCountAllTime: 2,
    manuallyResolvedCountAllTime: 1,
    now: new Date("2026-08-06T00:00:00Z"),
  })

  assert.deepEqual(
    summaries.map((summary) => summary.currency),
    ["aud", "usd"],
  )

  const aud = summaries[0]
  const usd = summaries[1]

  assert.equal(aud.cashWaitingSummary.outstanding, 4500)
  assert.equal(aud.biggestDebtors[0]?.amountOwed, 4500)
  assert.equal(usd.cashWaitingSummary.outstanding, 5000)
  assert.equal(usd.biggestDebtors[0]?.amountOwed, 5000)
  assert.match(usd.aiSummaryLines[1]?.text ?? "", /worth \$50\./)
})

test("buildCurrencyDashboardSummaries preserves single-currency output shape", () => {
  const summaries = buildCurrencyDashboardSummaries({
    activeInvoices: [makeActiveInvoice({ id: "usd-active-1", amountDue: 1250, currency: "usd" })],
    paidInvoices: [makePaidInvoice({ id: "usd-paid-1", amountDue: 2500, currency: "usd" })],
    displayName: null,
    brokenPromiseCountsByDebtor: {},
    paidCountAllTime: 1,
    manuallyResolvedCountAllTime: 0,
    now: new Date("2026-08-06T00:00:00Z"),
  })

  assert.equal(summaries.length, 1)
  assert.equal(summaries[0]?.currency, "usd")
  assert.equal(summaries[0]?.cashWaitingSummary.outstanding, 1250)
})
