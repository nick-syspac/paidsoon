import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { XeroProvider } from "@/lib/providers/accounting/xero"

describe("Tax metadata mapping", () => {
  test("maps Xero invoice tax metadata into normalized provider invoices", async () => {
    process.env.XERO_CLIENT_ID = "xero-client"
    process.env.XERO_CLIENT_SECRET = "xero-secret"

    const provider = new XeroProvider()
    const originalFetch = globalThis.fetch

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          Invoices: [
            {
              InvoiceID: "inv-1",
              InvoiceNumber: "INV-001",
              Contact: {
                ContactID: "contact-1",
                Name: "Acme Co",
                EmailAddress: "ap@acme.example",
              },
              AmountDue: 110,
              TotalTax: 10,
              LineAmountTypes: "Inclusive",
              CurrencyCode: "AUD",
              DueDate: "2026-09-30T00:00:00",
              Status: "AUTHORISED",
              UpdatedDateUTC: "2026-09-08T00:00:00",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )

    try {
      const invoices = await provider.getInvoices({
        accessToken: "token",
        organisationId: "tenant-1",
      })

      assert.equal(invoices.length, 1)
      assert.equal(invoices[0].taxMetadata?.taxAmount, 10)
      assert.equal(invoices[0].taxMetadata?.lineAmountType, "Inclusive")
      assert.equal(invoices[0].taxMetadata?.taxInclusive, true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
