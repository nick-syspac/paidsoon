import test from "node:test"
import assert from "node:assert/strict"
import {
  buildWeeklyDebtorSummaryEmail,
  buildWeeklyDebtorSummaryPayload,
  getWeeklyDebtorSummaryWeekStart,
} from "@/lib/email/weeklyDebtorSummary"

function makeInvoice(overrides: {
  clientEmail: string
  clientName: string
  amountDue: number
  dueDate: string
  status?: "pending" | "paused" | "snoozed" | "sequence_complete" | "paid"
  currency?: string
}) {
  return {
    clientEmail: overrides.clientEmail,
    clientName: overrides.clientName,
    amountDue: overrides.amountDue,
    dueDate: new Date(overrides.dueDate),
    status: overrides.status ?? "pending",
    currency: overrides.currency ?? "usd",
    payments: [],
  }
}

test("buildWeeklyDebtorSummaryPayload only counts overdue active invoices", () => {
  const asOf = new Date("2026-08-06T00:00:00Z")
  const payload = buildWeeklyDebtorSummaryPayload(
    [
      makeInvoice({ clientEmail: "a@example.com", clientName: "Alpha", amountDue: 5000, dueDate: "2026-08-01T00:00:00Z", currency: "usd" }),
      makeInvoice({ clientEmail: "a@example.com", clientName: "Alpha", amountDue: 2500, dueDate: "2026-07-15T00:00:00Z", currency: "usd" }),
      makeInvoice({ clientEmail: "a@example.com", clientName: "Alpha", amountDue: 1250, dueDate: "2026-07-20T00:00:00Z", currency: "aud" }),
      makeInvoice({ clientEmail: "b@example.com", clientName: "Beta", amountDue: 1500, dueDate: "2026-07-22T00:00:00Z", currency: "aud" }),
      makeInvoice({ clientEmail: "c@example.com", clientName: "Paused", amountDue: 1200, dueDate: "2026-08-04T00:00:00Z", status: "paused" }),
      makeInvoice({ clientEmail: "c@example.com", clientName: "Closed", amountDue: 9999, dueDate: "2026-07-01T00:00:00Z", status: "paid" }),
      makeInvoice({ clientEmail: "future@example.com", clientName: "Future", amountDue: 1000, dueDate: "2026-08-09T00:00:00Z" }),
    ],
    asOf,
  )

  assert.equal(payload.overdueInvoiceCount, 5)
  assert.equal(payload.debtorCount, 3)
  assert.equal(payload.currencySections.length, 2)
  assert.equal(payload.currencySections[0]?.currency, "aud")
  assert.equal(payload.currencySections[0]?.totalOutstanding, 2750)
  assert.equal(payload.currencySections[1]?.currency, "usd")
  assert.equal(payload.currencySections[1]?.totalOutstanding, 8700)
  assert.equal(payload.currencySections[1]?.biggestDebtors[0]?.clientEmail, "a@example.com")
  assert.equal(payload.currencySections[1]?.biggestDebtors[0]?.invoiceCount, 2)
})

test("buildWeeklyDebtorSummaryEmail renders separate currency sections", () => {
  const payload = buildWeeklyDebtorSummaryPayload(
    [
      makeInvoice({ clientEmail: "a@example.com", clientName: "Alpha & Co", amountDue: 5000, dueDate: "2026-08-01T00:00:00Z", currency: "usd" }),
      makeInvoice({ clientEmail: "b@example.com", clientName: "Beta <Ltd>", amountDue: 2500, dueDate: "2026-07-15T00:00:00Z", currency: "aud" }),
    ],
    new Date("2026-08-06T00:00:00Z"),
  )

  const content = buildWeeklyDebtorSummaryEmail({ tenantName: "Alex", payload })

  assert.match(content.subject, /Weekly debtor summary for Alex/)
  assert.match(content.text, /Overdue invoices: 2/)
  assert.match(content.text, /USD:/)
  assert.match(content.text, /AUD:/)
  assert.match(content.text, /Alpha & Co/)
  assert.match(content.html, /Alpha &amp; Co/)
  assert.match(content.html, /Beta &lt;Ltd&gt;/)
})

test("weekly debtor summary week start resolves to Monday UTC", () => {
  const weekStart = getWeeklyDebtorSummaryWeekStart(new Date("2026-08-06T12:00:00Z"))
  assert.equal(weekStart.toISOString(), "2026-08-03T00:00:00.000Z")
})