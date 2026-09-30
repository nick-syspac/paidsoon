import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, test } from "node:test"

import { MyobProvider } from "@/lib/providers/accounting/myob"

const ORIGINAL_FETCH = globalThis.fetch

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("MyobProvider spend endpoint contracts", () => {
  beforeEach(() => {
    process.env.MYOB_CLIENT_ID = "test-client-id"
    process.env.MYOB_CLIENT_SECRET = "test-client-secret"
  })

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  test("getSpendBills skips unsupported Purchase/Bill/TimeBilling subtype", async () => {
    const calls: string[] = []
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      calls.push(url)

      if (url.includes("/Purchase/Bill/")) {
        return jsonResponse({ Items: [] })
      }

      throw new Error(`Unexpected URL: ${url}`)
    }

    const provider = new MyobProvider()
    const bills = await provider.getSpendBills({
      accessToken: "access-token",
      organisationId: "https://api.myob.com/accountright/company-guid",
    })

    assert.equal(bills.length, 0)

    const billSubtypePaths = calls
      .filter((url) => url.includes("/Purchase/Bill/"))
      .map((url) => url.split("/Purchase/Bill/")[1]?.split("?")[0] ?? "")

    assert.deepEqual(
      billSubtypePaths.sort(),
      ["Item", "Miscellaneous", "Professional", "Service"].sort()
    )
    assert.equal(billSubtypePaths.includes("TimeBilling"), false)
  })

  test("getSpendBankTransactions uses canonical banking families and normalizes records", async () => {
    const calls: string[] = []
    globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      calls.push(url)

      if (url.includes("/Banking/SpendMoneyTxn")) {
        return jsonResponse({
          Items: [
            {
              UID: "sp-123",
              Date: "2026-09-01T00:00:00",
              Memo: "Supplier payment",
              AmountPaid: 125.5,
              PaymentNumber: "PMT-001",
              Account: { Name: "Main Bank", DisplayID: "1-1110" },
              Contact: { UID: "sup-1", Name: "Acme Supplies" },
              CurrencyCode: "AUD",
            },
          ],
        })
      }

      if (url.includes("/Banking/ReceiveMoneyTxn")) {
        return jsonResponse({
          Items: [
            {
              UID: "rcv-456",
              Date: "2026-09-02T00:00:00",
              LastModified: "2026-09-03T00:00:00",
              Memo: "Refund received",
              AmountReceived: 40.25,
              ReceiptNumber: "RCT-777",
              Account: { Name: "Main Bank", DisplayID: "1-1110" },
              Contact: { UID: "sup-2", Name: "Vendor Refunds" },
              CurrencyCode: "AUD",
            },
          ],
        })
      }

      if (url.includes("/Banking/Transaction")) {
        return jsonResponse({ Errors: [{ Message: "legacy endpoint should not be called" }] }, 500)
      }

      throw new Error(`Unexpected URL: ${url}`)
    }

    const provider = new MyobProvider()
    const transactions = await provider.getSpendBankTransactions({
      accessToken: "access-token",
      organisationId: "https://api.myob.com/accountright/company-guid",
      modifiedAfter: new Date("2026-08-01T00:00:00Z"),
    })

    assert.equal(transactions.length, 2)

    const spend = transactions.find((tx) => tx.providerTransactionId === "spend:sp-123")
    const receive = transactions.find((tx) => tx.providerTransactionId === "receive:rcv-456")

    assert.ok(spend)
    assert.ok(receive)

    assert.equal(spend?.amount, -125.5)
    assert.equal(spend?.reference, "PMT-001")
    assert.equal(spend?.counterpartyName, "Acme Supplies")

    assert.equal(receive?.amount, 40.25)
    assert.equal(receive?.reference, "RCT-777")
    assert.equal(receive?.counterpartyName, "Vendor Refunds")

    assert.ok(calls.some((url) => url.includes("/Banking/SpendMoneyTxn")))
    assert.ok(calls.some((url) => url.includes("/Banking/ReceiveMoneyTxn")))
    assert.equal(calls.some((url) => url.includes("/Banking/Transaction")), false)

    // modifiedAfter should apply Date-based filtering for both canonical endpoint families.
    const dateFilteredCalls = calls.filter(
      (url) =>
        (url.includes("$filter=") || url.includes("%24filter=")) &&
        url.includes("Date") &&
        url.includes("datetime") &&
        (url.includes("/Banking/SpendMoneyTxn") || url.includes("/Banking/ReceiveMoneyTxn"))
    )
    assert.equal(dateFilteredCalls.length, 2)
  })
})
