import { describe, test } from "node:test"
import assert from "node:assert/strict"

import { applyExportFilters, resolveStatuses } from "@/lib/invoices/exportQuery"
import { ACTIVE_INVOICE_STATUSES, RESOLVED_INVOICE_STATUSES } from "@/lib/dashboard/loadDashboardInvoices"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"

function makeInvoice(overrides: Partial<InvoiceWithRelations> & { id: string }): InvoiceWithRelations {
  return {
    userId: "user-1",
    invoiceConnectionId: "conn-1",
    customerId: null,
    externalId: `ext-${overrides.id}`,
    provider: "stripe",
    clientEmail: "client@example.com",
    clientName: "Client",
    amountDue: 1000,
    currency: "usd",
    dueDate: new Date("2026-06-01"),
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
    createdAt: new Date("2026-05-01"),
    updatedAt: new Date("2026-05-01"),
    emailLogs: [],
    promisesToPay: [],
    arrangementCoverages: [],
    payments: [],
    ...overrides,
  } as InvoiceWithRelations
}

const emptyContext = { brokenPromiseCountsByDebtor: {}, escalationThreshold: 2, heldInvoiceIds: new Set<string>() }

describe("resolveStatuses", () => {
  test("uses explicit statuses when provided", () => {
    assert.deepEqual(resolveStatuses({ statuses: ["paid"] }), ["paid"])
  })

  test("uses the active bucket when no explicit statuses are given", () => {
    assert.deepEqual(resolveStatuses({ statusBucket: "active" }), ACTIVE_INVOICE_STATUSES)
  })

  test("uses the resolved bucket when requested", () => {
    assert.deepEqual(resolveStatuses({ statusBucket: "resolved" }), RESOLVED_INVOICE_STATUSES)
  })

  test("falls back to every status when neither is given (Settings 'all invoices')", () => {
    const all = resolveStatuses({})
    assert.ok(ACTIVE_INVOICE_STATUSES.every((s) => all.includes(s)))
    assert.ok(RESOLVED_INVOICE_STATUSES.every((s) => all.includes(s)))
  })
})

describe("applyExportFilters", () => {
  test("applies the overview-card filter", () => {
    const invoices = [makeInvoice({ id: "1", status: "disputed" }), makeInvoice({ id: "2", status: "pending" })]
    const result = applyExportFilters(invoices, { overviewFilter: "disputed" }, emptyContext)
    assert.deepEqual(result.map((i) => i.id), ["1"])
  })

  test("filters by customerId", () => {
    const invoices = [makeInvoice({ id: "1", customerId: "cust-a" }), makeInvoice({ id: "2", customerId: "cust-b" })]
    const result = applyExportFilters(invoices, { customerId: "cust-a" }, emptyContext)
    assert.deepEqual(result.map((i) => i.id), ["1"])
  })

  test("a customerId belonging to another tenant matches nothing (never fetched cross-tenant)", () => {
    const invoices = [makeInvoice({ id: "1", customerId: "cust-a" })]
    const result = applyExportFilters(invoices, { customerId: "cust-from-another-tenant" }, emptyContext)
    assert.deepEqual(result, [])
  })

  test("filters by provider (accounting source)", () => {
    const invoices = [makeInvoice({ id: "1", provider: "xero" }), makeInvoice({ id: "2", provider: "stripe" })]
    const result = applyExportFilters(invoices, { provider: "xero" }, emptyContext)
    assert.deepEqual(result.map((i) => i.id), ["1"])
  })

  test("filters by inclusive due_date range", () => {
    const invoices = [
      makeInvoice({ id: "1", dueDate: new Date("2026-06-01") }),
      makeInvoice({ id: "2", dueDate: new Date("2026-06-15") }),
      makeInvoice({ id: "3", dueDate: new Date("2026-07-01") }),
    ]
    const result = applyExportFilters(
      invoices,
      { dateField: "due_date", dateFrom: new Date("2026-06-01"), dateTo: new Date("2026-06-15") },
      emptyContext,
    )
    assert.deepEqual(result.map((i) => i.id), ["1", "2"])
  })

  test("filters by inclusive created_date range", () => {
    const invoices = [
      makeInvoice({ id: "1", createdAt: new Date("2026-05-01") }),
      makeInvoice({ id: "2", createdAt: new Date("2026-05-20") }),
    ]
    const result = applyExportFilters(
      invoices,
      { dateField: "created_date", dateFrom: new Date("2026-05-15") },
      emptyContext,
    )
    assert.deepEqual(result.map((i) => i.id), ["2"])
  })

  test("combines overview-card, customer, provider, and date-range filters", () => {
    const invoices = [
      makeInvoice({ id: "1", status: "disputed", customerId: "cust-a", provider: "xero", dueDate: new Date("2026-06-10") }),
      makeInvoice({ id: "2", status: "disputed", customerId: "cust-a", provider: "stripe", dueDate: new Date("2026-06-10") }),
      makeInvoice({ id: "3", status: "disputed", customerId: "cust-b", provider: "xero", dueDate: new Date("2026-06-10") }),
      makeInvoice({ id: "4", status: "pending", customerId: "cust-a", provider: "xero", dueDate: new Date("2026-06-10") }),
    ]
    const result = applyExportFilters(
      invoices,
      {
        overviewFilter: "disputed",
        customerId: "cust-a",
        provider: "xero",
        dateField: "due_date",
        dateFrom: new Date("2026-06-01"),
        dateTo: new Date("2026-06-30"),
      },
      emptyContext,
    )
    assert.deepEqual(result.map((i) => i.id), ["1"])
  })
})
