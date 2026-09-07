/**
 * Unit tests for MyobProvider.
 * All fetch calls are mocked — no real network requests.
 */
import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import { MyobProvider } from "@/lib/providers/accounting/myob"

before(() => {
  process.env.MYOB_CLIENT_ID = "test-myob-client"
  process.env.MYOB_CLIENT_SECRET = "test-myob-secret"
  process.env.MYOB_REDIRECT_URI = "http://localhost:3000/api/integrations/myob/callback"
})

after(() => {
  delete process.env.MYOB_CLIENT_ID
  delete process.env.MYOB_CLIENT_SECRET
  delete process.env.MYOB_REDIRECT_URI
})

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>) {
  let callIndex = 0
  globalThis.fetch = async (_url: string | URL | Request, _init?: RequestInit) => {
    const resp = responses[callIndex++]
    if (!resp) throw new Error(`Unexpected fetch call ${callIndex}`)
    const headerMap = new Map(Object.entries(resp.headers ?? {}))
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      headers: { get: (k: string) => headerMap.get(k) ?? null },
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
    } as unknown as Response
  }
}

describe("MyobProvider", () => {
  const provider = new MyobProvider()

  describe("getAuthorizationUrl", () => {
    test("includes required scopes and client_id", () => {
      const url = provider.getAuthorizationUrl({
        state: "xyz789",
        redirectUri: "http://localhost:3000/api/integrations/myob/callback",
      })
      assert.ok(url.includes("client_id=test-myob-client"))
      assert.ok(url.includes("sme-sales"))
      assert.ok(url.includes("sme-contacts-customer"))
      assert.ok(url.includes("sme-company-file"))
      assert.ok(url.includes("state=xyz789"))
    })
  })

  describe("exchangeCodeForTokens", () => {
    test("returns token set", async () => {
      mockFetch([
        {
          status: 200,
          body: { access_token: "at-myob", refresh_token: "rt-myob", expires_in: 1200 },
        },
      ])

      const tokens = await provider.exchangeCodeForTokens({
        code: "code-myob",
        redirectUri: "http://localhost:3000/api/integrations/myob/callback",
      })
      assert.equal(tokens.accessToken, "at-myob")
      assert.equal(tokens.refreshToken, "rt-myob")
      assert.equal(tokens.expiresIn, 1200)
    })

    test("throws AccountingProviderError on 401", async () => {
      mockFetch([{ status: 401, body: { error: "invalid_grant" } }])
      await assert.rejects(
        () =>
          provider.exchangeCodeForTokens({
            code: "bad",
            redirectUri: "http://localhost:3000/api/integrations/myob/callback",
          }),
        { name: "AccountingProviderError", kind: "unauthorized" }
      )
    })
  })

  describe("refreshTokens", () => {
    test("returns new token set", async () => {
      mockFetch([
        {
          status: 200,
          body: { access_token: "at-new", refresh_token: "rt-new", expires_in: 1200 },
        },
      ])
      const tokens = await provider.refreshTokens("rt-old")
      assert.equal(tokens.accessToken, "at-new")
    })
  })

  describe("revokeToken", () => {
    test("resolves without error (no-op)", async () => {
      // revokeToken is a no-op for MYOB — should not throw
      await assert.doesNotReject(() => provider.revokeToken("any-refresh-token"))
    })
  })

  describe("getOrganisations", () => {
    test("maps company file list response to Organisation[]", async () => {
      mockFetch([
        {
          status: 200,
          body: [
            { Id: "abc-123", Name: "Bob Co Pty Ltd", Uri: "https://api.myob.com/accountright/abc-123" },
            { Id: "def-456", Name: "", Uri: "https://api.myob.com/accountright/def-456" },
          ],
        },
      ])

      const orgs = await provider.getOrganisations("at-myob")
      assert.equal(orgs.length, 2)
      assert.equal(orgs[0].id, "https://api.myob.com/accountright/abc-123")
      assert.equal(orgs[0].name, "Bob Co Pty Ltd")
      // Falls back to the Id when Name is blank rather than an empty string
      assert.equal(orgs[1].name, "def-456")
    })

    test("skips entries with no Uri", async () => {
      mockFetch([
        { status: 200, body: [{ Id: "no-uri", Name: "No Uri Co" }] },
      ])
      const orgs = await provider.getOrganisations("at-myob")
      assert.deepEqual(orgs, [])
    })

    test("returns empty array when the response is not an array", async () => {
      mockFetch([{ status: 200, body: { unexpected: "shape" } }])
      const orgs = await provider.getOrganisations("at-myob")
      assert.deepEqual(orgs, [])
    })

    test("propagates AccountingProviderError on 401", async () => {
      mockFetch([{ status: 401, body: { error: "invalid_token" } }])
      await assert.rejects(
        () => provider.getOrganisations("bad-token"),
        { name: "AccountingProviderError", kind: "unauthorized" }
      )
    })
  })

  describe("getInvoices", () => {
    test("maps MYOB Open service invoice to open status", async () => {
      // 5 invoice type calls; first returns data, rest return empty
      const emptyResponse = { status: 200, body: { Items: [] } }
      mockFetch([
        {
          status: 200,
          body: {
            Items: [
              {
                UID: "myob-inv-1",
                Number: "00001",
                Status: "Open",
                BalanceDue: 1000.0,
                TotalAmount: 1100.0,
                Customer: { UID: "cust-1", Name: "Bob Co", Addresses: [{ Email: "bob@example.com" }] },
                Terms: { DueDate: "2025-12-31T00:00:00" },
                LastModified: "2025-06-01T10:00:00",
                CurrencyCode: "AUD",
              },
            ],
          },
        },
        emptyResponse,
        emptyResponse,
        emptyResponse,
        emptyResponse,
      ])

      const cf_uri = "https://api.myob.com/accountright/abc123"
      const invoices = await provider.getInvoices({
        accessToken: "at-myob",
        organisationId: cf_uri,
      })

      assert.equal(invoices.length, 1)
      assert.equal(invoices[0].providerInvoiceId, "myob-inv-1")
      assert.equal(invoices[0].invoiceNumber, "00001")
      assert.equal(invoices[0].status, "open")
      assert.equal(invoices[0].amountDue, 1000.0)
      assert.equal(invoices[0].clientEmail, "bob@example.com")
      assert.equal(invoices[0].currency, "AUD")
    })

    test("maps MYOB Closed invoice to paid status", async () => {
      const emptyResponse = { status: 200, body: { Items: [] } }
      mockFetch([
        {
          status: 200,
          body: {
            Items: [
              {
                UID: "myob-inv-2",
                Status: "Closed",
                BalanceDue: 0,
                Customer: { UID: "cust-2", Name: "Jane Ltd", Addresses: [] },
                Terms: { DueDate: "2025-11-30T00:00:00" },
                LastModified: "2025-06-01T10:00:00",
              },
            ],
          },
        },
        emptyResponse,
        emptyResponse,
        emptyResponse,
        emptyResponse,
      ])

      const invoices = await provider.getInvoices({
        accessToken: "at-myob",
        organisationId: "https://api.myob.com/accountright/abc",
      })
      assert.equal(invoices[0].status, "paid")
    })
  })

  describe("getContacts", () => {
    test("returns empty array for empty contactIds", async () => {
      const contacts = await provider.getContacts({
        accessToken: "at-myob",
        organisationId: "https://api.myob.com/accountright/abc",
        contactIds: [],
      })
      assert.deepEqual(contacts, [])
    })

    test("maps MYOB contact fields", async () => {
      mockFetch([
        {
          status: 200,
          body: {
            Items: [
              { UID: "cust-1", CompanyName: "Bob Co", Addresses: [{ Email: "bob@example.com" }] },
            ],
          },
        },
      ])

      const contacts = await provider.getContacts({
        accessToken: "at-myob",
        organisationId: "https://api.myob.com/accountright/abc",
        contactIds: ["cust-1"],
      })
      assert.equal(contacts.length, 1)
      assert.equal(contacts[0].providerContactId, "cust-1")
      assert.equal(contacts[0].name, "Bob Co")
      assert.equal(contacts[0].email, "bob@example.com")
    })
  })

  describe("getSpendBills", () => {
    test("maps MYOB purchase bills into normalized spend bills", async () => {
      const emptyResponse = { status: 200, body: { Items: [] } }
      mockFetch([
        {
          status: 200,
          body: {
            Items: [
              {
                UID: "bill-1",
                Number: "PUR-001",
                Status: "Open",
                BalanceDue: 320.0,
                TotalAmount: 352.0,
                TotalTax: 32.0,
                Supplier: {
                  UID: "sup-1",
                  Name: "Cloud Vendor",
                  Addresses: [{ Email: "billing@vendor.test" }],
                },
                Terms: { DueDate: "2025-12-31T00:00:00" },
                LastModified: "2025-06-01T10:00:00",
                CurrencyCode: "AUD",
                JournalMemo: "Monthly subscription",
                Category: { UID: "cat-1", DisplayID: "6-2300", Name: "Software" },
              },
            ],
          },
        },
        emptyResponse,
        emptyResponse,
        emptyResponse,
        emptyResponse,
      ])

      const bills = await provider.getSpendBills({
        accessToken: "at-myob",
        organisationId: "https://api.myob.com/accountright/abc123",
      })

      assert.equal(bills.length, 1)
      assert.equal(bills[0].providerBillId, "bill-1")
      assert.equal(bills[0].providerSupplierId, "sup-1")
      assert.equal(bills[0].supplierName, "Cloud Vendor")
      assert.equal(bills[0].expenseAccountCode, "6-2300")
      assert.equal(bills[0].status, "open")
    })
  })

  describe("getSpendBankTransactions", () => {
    test("maps MYOB bank transactions into normalized spend rows", async () => {
      mockFetch([
        {
          status: 200,
          body: {
            Items: [
              {
                UID: "txn-1",
                Date: "2025-06-01T10:00:00",
                LastModified: "2025-06-01T11:00:00",
                Amount: 199.0,
                Memo: "Vendor debit",
                ReferenceNumber: "RF-9001",
                Account: { Name: "Operating", DisplayID: "1-1100" },
                Contact: { UID: "sup-1", Name: "Cloud Vendor" },
                CurrencyCode: "AUD",
              },
            ],
          },
        },
      ])

      const rows = await provider.getSpendBankTransactions({
        accessToken: "at-myob",
        organisationId: "https://api.myob.com/accountright/abc123",
      })

      assert.equal(rows.length, 1)
      assert.equal(rows[0].providerTransactionId, "txn-1")
      assert.equal(rows[0].providerSupplierId, "sup-1")
      assert.equal(rows[0].accountCode, "1-1100")
      assert.equal(rows[0].amount, 199)
      assert.equal(rows[0].reference, "RF-9001")
    })
  })

  describe("getSpendSuppliers", () => {
    test("maps MYOB supplier contacts into normalized supplier rows", async () => {
      mockFetch([
        {
          status: 200,
          body: {
            Items: [
              {
                UID: "sup-1",
                CompanyName: "Cloud Vendor",
                ABN: "51824753556",
                PaymentTerms: { Note: "Due 14" },
                SellingDetails: { TaxCode: { Code: "GST", Name: "GST on Income" } },
                Addresses: [{ Email: "billing@vendor.test" }],
                LastModified: "2025-06-01T11:00:00",
              },
            ],
          },
        },
      ])

      const suppliers = await provider.getSpendSuppliers({
        accessToken: "at-myob",
        organisationId: "https://api.myob.com/accountright/abc123",
      })

      assert.equal(suppliers.length, 1)
      assert.equal(suppliers[0].providerSupplierId, "sup-1")
      assert.equal(suppliers[0].supplierName, "Cloud Vendor")
      assert.equal(suppliers[0].supplierEmail, "billing@vendor.test")
      assert.equal(suppliers[0].paymentTerms, "Due 14")
    })
  })

  describe("getSpendExpenseAccounts", () => {
    test("maps MYOB expense accounts into normalized account rows", async () => {
      mockFetch([
        {
          status: 200,
          body: {
            Items: [
              {
                UID: "acc-1",
                DisplayID: "6-2300",
                Name: "Software",
                Classification: "Expense",
                LastModified: "2025-06-01T11:00:00",
              },
            ],
          },
        },
      ])

      const accounts = await provider.getSpendExpenseAccounts({
        accessToken: "at-myob",
        organisationId: "https://api.myob.com/accountright/abc123",
      })

      assert.equal(accounts.length, 1)
      assert.equal(accounts[0].providerAccountId, "acc-1")
      assert.equal(accounts[0].accountCode, "6-2300")
      assert.equal(accounts[0].accountName, "Software")
      assert.equal(accounts[0].classification, "Expense")
    })
  })
})
