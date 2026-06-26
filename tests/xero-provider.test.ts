/**
 * Unit tests for XeroProvider.
 * All fetch calls are mocked — no real network requests.
 */
import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import { XeroProvider } from "@/lib/providers/accounting/xero"

// Minimal env setup
before(() => {
  process.env.XERO_CLIENT_ID = "test-client-id"
  process.env.XERO_CLIENT_SECRET = "test-client-secret"
  process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/integrations/xero/callback"
})

after(() => {
  delete process.env.XERO_CLIENT_ID
  delete process.env.XERO_CLIENT_SECRET
  delete process.env.XERO_REDIRECT_URI
})

// Helper to mock globalThis.fetch
function mockFetch(
  responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>
) {
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

describe("XeroProvider", () => {
  const provider = new XeroProvider()

  describe("getAuthorizationUrl", () => {
    test("includes required scopes and client_id", () => {
      const url = provider.getAuthorizationUrl({
        state: "abc123",
        redirectUri: "http://localhost:3000/api/integrations/xero/callback",
      })
      assert.ok(url.includes("client_id=test-client-id"))
      assert.ok(url.includes("accounting.invoices.read"))
      assert.ok(url.includes("accounting.contacts.read"))
      assert.ok(url.includes("accounting.payments.read"))
      assert.ok(url.includes("offline_access"))
      assert.ok(url.includes("state=abc123"))
    })
  })

  describe("exchangeCodeForTokens", () => {
    test("returns token set from successful response", async () => {
      mockFetch([
        {
          status: 200,
          body: {
            access_token: "at123",
            refresh_token: "rt123",
            expires_in: 1800,
            scope: "openid offline_access accounting.invoices.read",
          },
        },
      ])

      const tokens = await provider.exchangeCodeForTokens({
        code: "code123",
        redirectUri: "http://localhost:3000/api/integrations/xero/callback",
      })
      assert.equal(tokens.accessToken, "at123")
      assert.equal(tokens.refreshToken, "rt123")
      assert.equal(tokens.expiresIn, 1800)
    })

    test("throws AccountingProviderError on 401", async () => {
      mockFetch([{ status: 401, body: { error: "invalid_grant" } }])
      await assert.rejects(
        () =>
          provider.exchangeCodeForTokens({
            code: "bad-code",
            redirectUri: "http://localhost:3000/api/integrations/xero/callback",
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
          body: { access_token: "at-new", refresh_token: "rt-new", expires_in: 1800 },
        },
      ])
      const tokens = await provider.refreshTokens("rt-old")
      assert.equal(tokens.accessToken, "at-new")
      assert.equal(tokens.refreshToken, "rt-new")
    })
  })

  describe("getOrganisations", () => {
    test("returns only ORGANISATION type tenants", async () => {
      mockFetch([
        {
          status: 200,
          body: [
            { id: "conn-1", tenantId: "tid-1", tenantName: "ACME Ltd", tenantType: "ORGANISATION" },
            { id: "conn-2", tenantId: "tid-2", tenantName: "Demo Project", tenantType: "PROJECT" },
          ],
        },
      ])
      const orgs = await provider.getOrganisations("at123")
      assert.equal(orgs.length, 1)
      assert.equal(orgs[0].id, "tid-1")
      assert.equal(orgs[0].name, "ACME Ltd")
    })
  })

  describe("getInvoices", () => {
    test("maps Xero AUTHORISED invoice to open status", async () => {
      mockFetch([
        {
          status: 200,
          body: {
            Invoices: [
              {
                InvoiceID: "inv-1",
                InvoiceNumber: "INV-001",
                Contact: { ContactID: "con-1", Name: "Client A", EmailAddress: "a@example.com" },
                AmountDue: 500.0,
                CurrencyCode: "AUD",
                DueDate: "/Date(1735689600000)/",
                Status: "AUTHORISED",
                UpdatedDateUTC: "/Date(1735689600000)/",
                Type: "ACCREC",
              },
            ],
          },
        },
      ])

      const invoices = await provider.getInvoices({
        accessToken: "at123",
        organisationId: "tid-1",
      })
      assert.equal(invoices.length, 1)
      assert.equal(invoices[0].providerInvoiceId, "inv-1")
      assert.equal(invoices[0].status, "open")
      assert.equal(invoices[0].amountDue, 500.0)
      assert.equal(invoices[0].clientEmail, "a@example.com")
    })

    test("maps Xero PAID invoice to paid status", async () => {
      mockFetch([
        {
          status: 200,
          body: {
            Invoices: [
              {
                InvoiceID: "inv-2",
                Contact: { ContactID: "con-2", Name: "Client B" },
                AmountDue: 0,
                CurrencyCode: "NZD",
                DueDate: "/Date(1735689600000)/",
                Status: "PAID",
              },
            ],
          },
        },
      ])

      const invoices = await provider.getInvoices({
        accessToken: "at123",
        organisationId: "tid-1",
      })
      assert.equal(invoices[0].status, "paid")
    })

    test("stops paginating when fewer than pageSize results returned", async () => {
      // Two pages: first returns 1 invoice (< 250), so should stop
      let fetchCalls = 0
      globalThis.fetch = async () => {
        fetchCalls++
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            Invoices: [
              {
                InvoiceID: `inv-${fetchCalls}`,
                Contact: { ContactID: "c1", Name: "X" },
                AmountDue: 100,
                CurrencyCode: "AUD",
                DueDate: "/Date(1735689600000)/",
                Status: "AUTHORISED",
              },
            ],
          }),
          text: async () => "",
        } as unknown as Response
      }

      const invoices = await provider.getInvoices({
        accessToken: "at123",
        organisationId: "tid-1",
      })
      assert.equal(fetchCalls, 1)
      assert.equal(invoices.length, 1)
    })
  })

  describe("getContacts", () => {
    test("returns empty array for empty contactIds", async () => {
      const contacts = await provider.getContacts({
        accessToken: "at123",
        organisationId: "tid-1",
        contactIds: [],
      })
      assert.deepEqual(contacts, [])
    })

    test("maps Xero contact fields", async () => {
      mockFetch([
        {
          status: 200,
          body: {
            Contacts: [
              { ContactID: "con-1", Name: "Acme Corp", EmailAddress: "acme@example.com" },
            ],
          },
        },
      ])

      const contacts = await provider.getContacts({
        accessToken: "at123",
        organisationId: "tid-1",
        contactIds: ["con-1"],
      })
      assert.equal(contacts.length, 1)
      assert.equal(contacts[0].providerContactId, "con-1")
      assert.equal(contacts[0].email, "acme@example.com")
    })
  })
})
