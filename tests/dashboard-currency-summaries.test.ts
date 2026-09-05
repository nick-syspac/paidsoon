import test from "node:test"
import assert from "node:assert/strict"
import { buildCurrencyDashboardSummaries } from "@/lib/dashboard/currencySummary"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { PaidInvoiceSummary } from "@/lib/dashboard/loadDashboardMetrics"

function makeActiveInvoice(overrides: Partial<InvoiceWithRelations> & { id: string }): InvoiceWithRelations {
  const clientEmail = overrides.clientEmail ?? "client@example.com"
  const clientName = overrides.clientName ?? "Client"
  const amountDue = overrides.amountDue ?? 1000
  const currency = overrides.currency ?? "usd"
  const dueDate = overrides.dueDate ?? new Date("2026-08-01T00:00:00Z")
  return {
    userId: "user-1",
    invoiceConnectionId: "conn-1",
    financialInvoiceId: `fin-${overrides.id}`,
    customerId: null,
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
    financialInvoice: {
      id: `fin-${overrides.id}`,
      userId: "user-1",
      sourceSystem: "stripe",
      sourceId: `ext-${overrides.id}`,
      sourceUpdatedAt: null,
      syncedAt: new Date("2026-07-01T00:00:00Z"),
      accountingConnectionId: null,
      contactId: `contact-${overrides.id}`,
      invoiceNumber: null,
      amountDueCents: amountDue,
      currency,
      dueDate,
      issueDate: null,
      paymentUrl: null,
      rawSourceData: null,
      createdAt: new Date("2026-07-01T00:00:00Z"),
      updatedAt: new Date("2026-08-01T00:00:00Z"),
      contact: {
        id: `contact-${overrides.id}`,
        userId: "user-1",
        sourceSystem: "stripe",
        sourceId: `email:${clientEmail.toLowerCase()}`,
        sourceUpdatedAt: null,
        syncedAt: new Date("2026-07-01T00:00:00Z"),
        accountingConnectionId: null,
        name: clientName,
        email: clientEmail,
        emailLower: clientEmail.toLowerCase(),
        rawSourceData: null,
        createdAt: new Date("2026-07-01T00:00:00Z"),
        updatedAt: new Date("2026-08-01T00:00:00Z"),
      },
    },
    // Flat canonical projections (legacy names) as produced by the loader.
    clientEmail,
    clientName,
    amountDue,
    currency,
    dueDate,
    paymentUrl: null,
    externalId: `ext-${overrides.id}`,
    provider: "stripe",
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
    spendLeak: {
      hasAccess: true,
      hasAccountingConnection: true,
      findingCount: 3,
      statusTitle: "SpendLeak ready",
      topModuleTitle: "Recurring spend",
      topModuleFindingCount: 2,
      topModuleAnnualCents: 120000,
      sourceBreakdown: {
        providerSyncFindings: 2,
        expenseImportFindings: 1,
      },
    },
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
  assert.match(aud.aiSummaryLines.map((line) => line.text).join(" "), /SpendLeak flagged 3 findings/)
  assert.match(aud.aiSummaryLines.map((line) => line.text).join(" "), /Evidence sources: 2 provider-synced and 1 import-sourced findings/)
  assert.doesNotMatch(usd.aiSummaryLines.map((line) => line.text).join(" "), /SpendLeak flagged 3 findings/)
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
    spendLeak: {
      hasAccess: false,
      hasAccountingConnection: false,
      findingCount: 0,
      statusTitle: "SpendLeak locked",
      topModuleTitle: null,
      topModuleFindingCount: 0,
      topModuleAnnualCents: 0,
    },
    now: new Date("2026-08-06T00:00:00Z"),
  })

  assert.equal(summaries.length, 1)
  assert.equal(summaries[0]?.currency, "usd")
  assert.equal(summaries[0]?.cashWaitingSummary.outstanding, 1250)
  assert.match(
    summaries[0]?.aiSummaryLines.map((line) => line.text).join(" ") ?? "",
    /SpendLeak is locked on your current tier/,
  )
})
