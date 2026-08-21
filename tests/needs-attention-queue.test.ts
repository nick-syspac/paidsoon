/**
 * Tests for the category-grouped "Needs Attention" triage queue
 * (lib/dashboard/attentionRequired.ts), replacing the old flat ranked
 * message-list tests (openspec/changes/add-needs-attention-queue).
 */
import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { buildNeedsAttentionSummary } from "@/lib/dashboard/attentionRequired"
import type { InvoiceWithRelations } from "@/lib/dashboard/loadDashboardInvoices"
import type { EmailLog } from "@/lib/generated/prisma/client"

function makeEmailLog(overrides: Partial<EmailLog> & { id: string; trackedInvoiceId: string }): EmailLog {
  return {
    stage: 1,
    sentAt: new Date(),
    resendMessageId: "re_1",
    fromAddress: "from@example.com",
    subject: "Subject",
    htmlBody: null,
    textBody: null,
    status: "sent",
    ...overrides,
  } as EmailLog
}

function makeInvoice(
  overrides: Partial<InvoiceWithRelations> & { id: string },
): Pick<InvoiceWithRelations, "amountDue" | "dueDate" | "emailLogs" | "payments"> {
  return {
    amountDue: 1000,
    dueDate: new Date("2026-08-19"),
    emailLogs: [],
    payments: [],
    ...overrides,
  }
}

const BASE_INPUT = {
  brokenPromiseCountsByDebtor: {},
  escalationThreshold: 2,
  disputedInvoiceCount: 0,
  noContactEmailCustomerCount: 0,
  importAnomalyCount: 0,
}

describe("buildNeedsAttentionSummary", () => {
  test("returns all six categories at zero when nothing needs attention", () => {
    const summary = buildNeedsAttentionSummary({
      ...BASE_INPUT,
      activeInvoices: [],
      now: new Date("2026-08-20"),
    })

    assert.equal(summary.total, 0)
    assert.deepEqual(
      summary.categories.map((c) => c.id),
      ["broken_promises", "disputed", "bounced", "overdue_60_plus", "no_contact_email", "import_anomalies"],
    )
    assert.ok(summary.categories.every((c) => c.count === 0))
  })

  test("counts broken-promise debtors at or above the escalation threshold", () => {
    const summary = buildNeedsAttentionSummary({
      ...BASE_INPUT,
      activeInvoices: [],
      brokenPromiseCountsByDebtor: { "a@example.com": 2, "b@example.com": 1 },
      escalationThreshold: 2,
      now: new Date("2026-08-20"),
    })

    const category = summary.categories.find((c) => c.id === "broken_promises")
    assert.equal(category?.count, 1)
    assert.equal(summary.total, 1)
  })

  test("passes through disputed, no-contact-email, and import-anomaly counts", () => {
    const summary = buildNeedsAttentionSummary({
      ...BASE_INPUT,
      activeInvoices: [],
      disputedInvoiceCount: 3,
      noContactEmailCustomerCount: 2,
      importAnomalyCount: 1,
      now: new Date("2026-08-20"),
    })

    assert.equal(summary.categories.find((c) => c.id === "disputed")?.count, 3)
    assert.equal(summary.categories.find((c) => c.id === "no_contact_email")?.count, 2)
    assert.equal(summary.categories.find((c) => c.id === "import_anomalies")?.count, 1)
    assert.equal(summary.total, 6)
  })

  test("counts invoices with at least one bounced email log", () => {
    const invoices = [
      makeInvoice({
        id: "1",
        emailLogs: [makeEmailLog({ id: "log-1", trackedInvoiceId: "1", status: "bounced" })],
      }),
      makeInvoice({
        id: "2",
        emailLogs: [makeEmailLog({ id: "log-2", trackedInvoiceId: "2", status: "delivered" })],
      }),
    ]

    const summary = buildNeedsAttentionSummary({
      ...BASE_INPUT,
      activeInvoices: invoices,
      now: new Date("2026-08-20"),
    })

    assert.equal(summary.categories.find((c) => c.id === "bounced")?.count, 1)
  })

  test("counts invoices 61+ or 90+ days overdue as overdue_60_plus, not ones under 60 days", () => {
    const now = new Date("2026-08-20")
    const invoices = [
      makeInvoice({ id: "1", dueDate: new Date("2026-05-01") }), // ~111 days
      makeInvoice({ id: "2", dueDate: new Date("2026-06-15") }), // ~66 days
      makeInvoice({ id: "3", dueDate: new Date("2026-08-01") }), // ~19 days
    ]

    const summary = buildNeedsAttentionSummary({
      ...BASE_INPUT,
      activeInvoices: invoices,
      now,
    })

    assert.equal(summary.categories.find((c) => c.id === "overdue_60_plus")?.count, 2)
  })
})
