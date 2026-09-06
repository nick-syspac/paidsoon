import { describe, test } from "node:test"
import assert from "node:assert/strict"

import { StripeInvoiceProvider } from "@/lib/providers/stripe"

describe("StripeInvoiceProvider paymentUrl mapping", () => {
  const provider = new StripeInvoiceProvider()

  test("maps hosted_invoice_url to normalized paymentUrl on invoice.overdue webhook events", () => {
    const payload = JSON.stringify({
      type: "invoice.overdue",
      account: "acct_123",
      data: {
        object: {
          id: "in_123",
          customer_email: "client@example.com",
          customer_name: "Client Name",
          amount_due: 1099,
          currency: "aud",
          due_date: 1767225600,
          created: 1767139200,
          hosted_invoice_url: "  https://invoice.stripe.com/i/acct_123/test_abc  ",
          number: "INV-123",
        },
      },
    })

    const event = provider.parseWebhookEvent(payload)

    assert.equal(event.type, "invoice.overdue")
    assert.equal(event.connectedAccountId, "acct_123")
    assert.equal(event.invoice?.paymentUrl, "https://invoice.stripe.com/i/acct_123/test_abc")
  })

  test("maps null hosted_invoice_url to undefined paymentUrl", () => {
    const payload = JSON.stringify({
      type: "invoice.overdue",
      data: {
        object: {
          id: "in_456",
          customer_email: "client@example.com",
          customer_name: "Client Name",
          amount_due: 2099,
          currency: "aud",
          due_date: 1767225600,
          created: 1767139200,
          hosted_invoice_url: null,
        },
      },
    })

    const event = provider.parseWebhookEvent(payload)

    assert.equal(event.type, "invoice.overdue")
    assert.equal(event.invoice?.paymentUrl, undefined)
  })
})
