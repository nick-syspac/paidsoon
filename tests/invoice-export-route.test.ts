/**
 * Integration tests for the invoice export API route
 * (openspec/changes/add-invoice-export).
 *
 * Uses Node's built-in mock.module() to stub @/lib/supabase/server and
 * @/lib/db/withUserContext so no real DB, Stripe, or Resend calls are made.
 */
import { describe, test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let mockSubscriptionTier = "small_business"
let mockInvoices: Record<string, unknown>[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: any

function makeInvoice(overrides: Record<string, unknown> & { id: string }) {
  const provider = (overrides.provider as string | undefined) ?? "stripe"
  return {
    id: `inv-${overrides.id}`,
    userId: "user-123",
    invoiceConnectionId: "conn-1",
    customerId: null,
    financialInvoiceId: `finv-${overrides.id}`,
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
    financialInvoice: {
      id: `finv-${overrides.id}`,
      amountDueCents: 10000,
      currency: "aud",
      dueDate: new Date("2026-06-01"),
      paymentUrl: null,
      sourceId: `ext-${overrides.id}`,
      sourceSystem: provider,
      contact: {
        email: "client@example.com",
        name: "Client Pty Ltd",
      },
    },
    ...overrides,
  }
}

describe("GET /api/invoices/export", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          const tx = {
            userProfile: {
              findUnique: async () => ({
                subscriptionTier: mockSubscriptionTier,
                subscriptionStatus: "active",
                subscriptionCurrentPeriodStart: null,
                subscriptionCurrentPeriodEnd: null,
                trialEndsAt: null,
                createdAt: new Date("2026-01-01"),
              }),
            },
            trackedInvoice: {
              findMany: async () => mockInvoices,
              count: async () => 0,
            },
            emailLog: { findMany: async () => [] },
            promiseToPay: { findMany: async () => [] },
            arrangementInvoiceCoverage: { findMany: async () => [] },
            arrangement: { findMany: async () => [] },
            invoicePayment: { findMany: async () => [] },
            invoiceConnection: { findFirst: async () => null },
            promiseEscalationPolicy: { findUnique: async () => null },
          }
          return fn(tx)
        },
      },
    })

    ;({ GET } = await import("@/app/api/invoices/export/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockSubscriptionTier = "small_business"
    mockInvoices = [makeInvoice({ id: "1" }), makeInvoice({ id: "2", provider: "xero" })]
  })

  function makeRequest(query: string) {
    return new Request(`http://localhost/api/invoices/export?${query}`)
  }

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await GET(makeRequest("format=csv"))
    assert.strictEqual(res.status, 401)
  })

  test("returns 400 for an invalid format", async () => {
    const res = await GET(makeRequest("format=pdf"))
    assert.strictEqual(res.status, 400)
  })

  test("returns 400 for a malformed date filter", async () => {
    const res = await GET(makeRequest("format=csv&dateFrom=not-a-date"))
    assert.strictEqual(res.status, 400)
  })

  test("returns 403 without generating a file when the tier lacks csv_export", async () => {
    mockSubscriptionTier = "starter"
    const res = await GET(makeRequest("format=csv"))
    assert.strictEqual(res.status, 403)
    const body = await res.json()
    assert.ok(body.error)
  })

  test("returns a CSV file with the correct content type and filename", async () => {
    const res = await GET(makeRequest("format=csv"))
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.headers.get("Content-Type"), "text/csv; charset=utf-8")
    assert.match(res.headers.get("Content-Disposition") ?? "", /paidsoon-invoices-\d{4}-\d{2}-\d{2}\.csv/)
    const body = await res.text()
    assert.match(body, /invoice_reference/)
    assert.match(body, /ext-1/)
    assert.match(body, /ext-2/)
  })

  test("returns an XLSX file with the correct content type and filename", async () => {
    const res = await GET(makeRequest("format=xlsx"))
    assert.strictEqual(res.status, 200)
    assert.strictEqual(
      res.headers.get("Content-Type"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    assert.match(res.headers.get("Content-Disposition") ?? "", /paidsoon-invoices-\d{4}-\d{2}-\d{2}\.xlsx/)
  })

  test("applies the provider filter", async () => {
    const res = await GET(makeRequest("format=csv&provider=xero"))
    const body = await res.text()
    assert.doesNotMatch(body, /ext-1(?!\d)/)
    assert.match(body, /ext-2/)
  })

  test("a customerId that matches no invoice (e.g. belonging to another tenant) returns a header-only file", async () => {
    const res = await GET(makeRequest("format=csv&customerId=another-tenants-customer"))
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.headers.get("X-PaidSoon-Export-Row-Count"), "0")
    const body = await res.text()
    assert.match(body, /invoice_reference/)
    assert.doesNotMatch(body, /ext-1/)
  })

  test("empty export results still return 200 with a row-count header of 0", async () => {
    mockInvoices = []
    const res = await GET(makeRequest("format=csv"))
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.headers.get("X-PaidSoon-Export-Row-Count"), "0")
  })
})
