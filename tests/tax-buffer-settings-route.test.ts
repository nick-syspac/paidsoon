import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let hasFeature = true
let lastSavedPayload: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PUT: any

describe("PUT /api/tax-buffer/settings", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/billing", {
      namedExports: {
        requireFeature: async () => hasFeature,
      },
    })

    await mock.module("@/lib/taxBuffer/service", {
      namedExports: {
        getTaxBufferSettings: async () => ({ configuration: null, categories: [] }),
        saveTaxBufferSettings: async (_userId: string, payload: unknown) => {
          lastSavedPayload = payload
          return {
            id: "cfg-1",
            userId: "user-1",
            enabled: true,
            accountingBasis: "cash",
            businessType: "other",
            gstRegistered: true,
            gstFrequency: "quarterly",
            reserveBalanceSource: "manual",
            reserveBalanceCents: 10000,
          }
        },
      },
    })

    ;({ PUT } = await import("@/app/api/tax-buffer/settings/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    hasFeature = true
    lastSavedPayload = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null

    const req = new Request("http://localhost/api/tax-buffer/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const res = await PUT(req)
    assert.equal(res.status, 401)
  })

  test("returns 403 when feature is unavailable", async () => {
    hasFeature = false

    const req = new Request("http://localhost/api/tax-buffer/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const res = await PUT(req)
    assert.equal(res.status, 403)
  })

  test("rejects payloads with unknown fields", async () => {
    const req = new Request("http://localhost/api/tax-buffer/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        accountingBasis: "cash",
        businessType: "other",
        gstRegistered: true,
        gstFrequency: "quarterly",
        reserveBalanceSource: "manual",
        reserveBalanceCents: 10000,
        reserveAccountName: null,
        unexpected: "field",
      }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 400)
  })

  test("accepts valid settings payload and forwards category updates", async () => {
    const req = new Request("http://localhost/api/tax-buffer/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        accountingBasis: "cash",
        businessType: "other",
        gstRegistered: true,
        gstFrequency: "quarterly",
        reserveBalanceSource: "manual",
        reserveBalanceCents: 10000,
        reserveAccountName: "Reserve",
        categories: [
          {
            id: "cat-1",
            enabled: true,
            calculationMethod: "manual",
            recurrence: "monthly",
            manualAmountCents: 5000,
          },
        ],
      }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.configuration.userId, "user-1")

    const payload = lastSavedPayload as {
      categories: Array<{ id: string; manualAmountCents?: number }>
      reserveAccountName: string
    }
    assert.equal(payload.reserveAccountName, "Reserve")
    assert.equal(payload.categories[0].id, "cat-1")
    assert.equal(payload.categories[0].manualAmountCents, 5000)
  })
})
