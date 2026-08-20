import { describe, test } from "node:test"
import assert from "node:assert/strict"
import {
  buildOverviewCards,
  countBrokenPromiseDebtorsAtThreshold,
  deriveBouncedSeverity,
  deriveBrokenPromisesSeverity,
  deriveChaseAllowanceSeverity,
  deriveDisputedSeverity,
  deriveHeldInvoicesSeverity,
  deriveOverdueSeverity,
  filterInvoicesByOverviewCard,
  parseInvoiceOverviewFilter,
} from "@/lib/dashboard/overviewCards"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"

function makeInvoice(overrides: Partial<InvoiceWithRelations> & { id: string }): InvoiceWithRelations {
  return {
    userId: "user-1",
    invoiceConnectionId: "conn-1",
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
    createdAt: new Date(),
    updatedAt: new Date(),
    emailLogs: [],
    promisesToPay: [],
    arrangementCoverages: [],
    ...overrides,
  } as InvoiceWithRelations
}

describe("Overview card severity derivation", () => {
  test("Overdue: green when no invoice reached the second reminder", () => {
    const invoices = [makeInvoice({ id: "1", currentStage: 0 }), makeInvoice({ id: "2", currentStage: 1 })]
    assert.equal(deriveOverdueSeverity(invoices), "green")
  })

  test("Overdue: yellow when an invoice is on its second reminder", () => {
    const invoices = [makeInvoice({ id: "1", currentStage: 2 })]
    assert.equal(deriveOverdueSeverity(invoices), "yellow")
  })

  test("Overdue: red when an invoice reached the final reminder unresolved", () => {
    const invoices = [makeInvoice({ id: "1", currentStage: 1 }), makeInvoice({ id: "2", currentStage: 3 })]
    assert.equal(deriveOverdueSeverity(invoices), "red")
  })

  test("Chase allowance: green with no allowance data", () => {
    assert.equal(deriveChaseAllowanceSeverity(null), "green")
  })

  test("Chase allowance: yellow when near limit", () => {
    assert.equal(deriveChaseAllowanceSeverity({ atCapacity: false, nearLimit: true }), "yellow")
  })

  test("Chase allowance: red when at capacity", () => {
    assert.equal(deriveChaseAllowanceSeverity({ atCapacity: true, nearLimit: true }), "red")
  })

  test("Broken promises: counts only debtors at or above the escalation threshold", () => {
    const counts = { "a@example.com": 1, "b@example.com": 2, "c@example.com": 3 }
    assert.equal(countBrokenPromiseDebtorsAtThreshold(counts, 2), 2)
  })

  test("Broken promises: green with zero debtors over threshold, red otherwise", () => {
    assert.equal(deriveBrokenPromisesSeverity(0), "green")
    assert.equal(deriveBrokenPromisesSeverity(1), "red")
  })

  test("Held invoices: green with zero held, yellow otherwise (never red)", () => {
    assert.equal(deriveHeldInvoicesSeverity(0), "green")
    assert.equal(deriveHeldInvoicesSeverity(3), "yellow")
  })

  test("Disputed: green with zero disputed invoices, red otherwise", () => {
    assert.equal(deriveDisputedSeverity(0), "green")
    assert.equal(deriveDisputedSeverity(1), "red")
  })

  test("Bounced: green with zero bounced invoices, red otherwise", () => {
    assert.equal(deriveBouncedSeverity(0), "green")
    assert.equal(deriveBouncedSeverity(1), "red")
  })
})

describe("buildOverviewCards", () => {
  test("healthy account renders all-green cards", () => {
    const cards = buildOverviewCards({
      activeInvoices: [makeInvoice({ id: "1", currentStage: 0 })],
      chaseAllowance: {
        period: { start: new Date("2026-07-01"), end: new Date("2026-08-01") },
        allowance: 10,
        usage: 1,
        remaining: 9,
        atCapacity: false,
        nearLimit: false,
      },
      brokenPromiseCountsByDebtor: {},
      escalationThreshold: 2,
      heldInvoiceCount: 0,
      disputedInvoiceCount: 0,
    })

    assert.deepEqual(
      cards.map((card) => card.severity),
      ["green", "green", "green", "green", "green", "green"],
    )
  })

  test("at-risk account flags overdue, broken-promise, disputed, and bounced cards red independently of the others", () => {
    const cards = buildOverviewCards({
      activeInvoices: [
        makeInvoice({
          id: "1",
          currentStage: 3,
          emailLogs: [
            {
              id: "log-1",
              trackedInvoiceId: "1",
              stage: 1,
              sentAt: new Date(),
              resendMessageId: "re_1",
              fromAddress: "from@example.com",
              subject: "Subject",
              htmlBody: null,
              textBody: null,
              status: "bounced",
            },
          ],
        }),
      ],
      chaseAllowance: {
        period: { start: new Date("2026-07-01"), end: new Date("2026-08-01") },
        allowance: 10,
        usage: 1,
        remaining: 9,
        atCapacity: false,
        nearLimit: false,
      },
      brokenPromiseCountsByDebtor: { "a@example.com": 2 },
      escalationThreshold: 2,
      heldInvoiceCount: 0,
      disputedInvoiceCount: 1,
    })

    const byId = Object.fromEntries(cards.map((card) => [card.id, card.severity]))
    assert.equal(byId.overdue, "red")
    assert.equal(byId.broken_promises, "red")
    assert.equal(byId.chase_allowance, "green")
    assert.equal(byId.held_invoices, "green")
    assert.equal(byId.disputed, "red")
    assert.equal(byId.bounced, "red")
  })
})

describe("filterInvoicesByOverviewCard", () => {
  const invoices = [
    makeInvoice({ id: "1", currentStage: 0, clientEmail: "low@example.com" }),
    makeInvoice({ id: "2", currentStage: 2, clientEmail: "mid@example.com" }),
    makeInvoice({ id: "3", currentStage: 3, clientEmail: "broken@example.com" }),
  ]

  test("returns all invoices when filter is null", () => {
    assert.equal(
      filterInvoicesByOverviewCard(invoices, null, {
        brokenPromiseCountsByDebtor: {},
        escalationThreshold: 2,
        heldInvoiceIds: new Set(),
      }).length,
      3,
    )
  })

  test("'overdue' keeps invoices at currentStage 2 or above", () => {
    const filtered = filterInvoicesByOverviewCard(invoices, "overdue", {
      brokenPromiseCountsByDebtor: {},
      escalationThreshold: 2,
      heldInvoiceIds: new Set(),
    })
    assert.deepEqual(filtered.map((invoice) => invoice.id), ["2", "3"])
  })

  test("'broken_promises' keeps invoices whose debtor is at or above the threshold", () => {
    const filtered = filterInvoicesByOverviewCard(invoices, "broken_promises", {
      brokenPromiseCountsByDebtor: { "broken@example.com": 2 },
      escalationThreshold: 2,
      heldInvoiceIds: new Set(),
    })
    assert.deepEqual(filtered.map((invoice) => invoice.id), ["3"])
  })

  test("'held' keeps invoices present in the held-invoice set", () => {
    const filtered = filterInvoicesByOverviewCard(invoices, "held", {
      brokenPromiseCountsByDebtor: {},
      escalationThreshold: 2,
      heldInvoiceIds: new Set(["1"]),
    })
    assert.deepEqual(filtered.map((invoice) => invoice.id), ["1"])
  })

  test("'disputed' keeps invoices with status disputed", () => {
    const withDisputed = [...invoices, makeInvoice({ id: "4", status: "disputed" })]
    const filtered = filterInvoicesByOverviewCard(withDisputed, "disputed", {
      brokenPromiseCountsByDebtor: {},
      escalationThreshold: 2,
      heldInvoiceIds: new Set(),
    })
    assert.deepEqual(filtered.map((invoice) => invoice.id), ["4"])
  })

  test("'bounced' keeps invoices with a bounced email log", () => {
    const withBounce = [
      ...invoices,
      makeInvoice({
        id: "5",
        emailLogs: [
          {
            id: "log-5",
            trackedInvoiceId: "5",
            stage: 1,
            sentAt: new Date(),
            resendMessageId: "re_5",
            fromAddress: "from@example.com",
            subject: "Subject",
            htmlBody: null,
            textBody: null,
            status: "bounced",
          },
        ],
      }),
    ]
    const filtered = filterInvoicesByOverviewCard(withBounce, "bounced", {
      brokenPromiseCountsByDebtor: {},
      escalationThreshold: 2,
      heldInvoiceIds: new Set(),
    })
    assert.deepEqual(filtered.map((invoice) => invoice.id), ["5"])
  })

  test("'overdue_60_plus' keeps invoices at least 60 days past due", () => {
    const now = new Date("2026-08-20")
    const withOverdue = [
      makeInvoice({ id: "6", dueDate: new Date("2026-06-01") }), // 80 days
      makeInvoice({ id: "7", dueDate: new Date("2026-08-01") }), // 19 days
    ]
    const filtered = filterInvoicesByOverviewCard(withOverdue, "overdue_60_plus", {
      brokenPromiseCountsByDebtor: {},
      escalationThreshold: 2,
      heldInvoiceIds: new Set(),
      now,
    })
    assert.deepEqual(filtered.map((invoice) => invoice.id), ["6"])
  })

  test("'no_contact_email' and 'import_anomalies' return no invoices (no schema signal yet)", () => {
    const context = { brokenPromiseCountsByDebtor: {}, escalationThreshold: 2, heldInvoiceIds: new Set<string>() }
    assert.equal(filterInvoicesByOverviewCard(invoices, "no_contact_email", context).length, 0)
    assert.equal(filterInvoicesByOverviewCard(invoices, "import_anomalies", context).length, 0)
  })
})

describe("parseInvoiceOverviewFilter", () => {
  test("accepts known filter values", () => {
    assert.equal(parseInvoiceOverviewFilter("overdue"), "overdue")
    assert.equal(parseInvoiceOverviewFilter("broken_promises"), "broken_promises")
    assert.equal(parseInvoiceOverviewFilter("held"), "held")
    assert.equal(parseInvoiceOverviewFilter("disputed"), "disputed")
    assert.equal(parseInvoiceOverviewFilter("bounced"), "bounced")
    assert.equal(parseInvoiceOverviewFilter("overdue_60_plus"), "overdue_60_plus")
    assert.equal(parseInvoiceOverviewFilter("no_contact_email"), "no_contact_email")
    assert.equal(parseInvoiceOverviewFilter("import_anomalies"), "import_anomalies")
  })

  test("returns null for unknown or missing values", () => {
    assert.equal(parseInvoiceOverviewFilter("something_else"), null)
    assert.equal(parseInvoiceOverviewFilter(undefined), null)
  })
})
