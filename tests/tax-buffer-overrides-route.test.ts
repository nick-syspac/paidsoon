import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let hasFeature = true
let lastOverrideInput: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: any

describe("POST /api/tax-buffer/overrides", () => {
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
        listTaxBufferOverrides: async () => [],
        saveTaxBufferOverride: async (input: unknown) => {
          lastOverrideInput = input
          return {
            id: "override-1",
            ...((input ?? {}) as object),
            createdAt: new Date("2026-09-08T00:00:00.000Z"),
          }
        },
      },
    })

    ;({ POST } = await import("@/app/api/tax-buffer/overrides/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    hasFeature = true
    lastOverrideInput = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null

    const req = new Request("http://localhost/api/tax-buffer/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    assert.equal(res.status, 401)
  })

  test("returns 403 when feature is unavailable", async () => {
    hasFeature = false

    const req = new Request("http://localhost/api/tax-buffer/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })

    const res = await POST(req)
    assert.equal(res.status, 403)
  })

  test("rejects invalid override payload", async () => {
    const req = new Request("http://localhost/api/tax-buffer/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        calculatedValueCents: 1000,
        overrideValueCents: 1000,
        reason: "ok",
      }),
    })

    const res = await POST(req)
    assert.equal(res.status, 400)
  })

  test("captures audit fields on valid override", async () => {
    const req = new Request("http://localhost/api/tax-buffer/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reserveCategoryId: "cat-1",
        calculatedValueCents: 12000,
        overrideValueCents: 9000,
        reason: "Updated based on accountant advice",
        basedOnAccountant: true,
      }),
    })

    const res = await POST(req)
    assert.equal(res.status, 200)

    const input = lastOverrideInput as {
      userId: string
      createdBy: string
      reserveCategoryId: string
      basedOnAccountant: boolean
      reason: string
    }

    assert.equal(input.userId, "user-1")
    assert.equal(input.createdBy, "user-1")
    assert.equal(input.reserveCategoryId, "cat-1")
    assert.equal(input.basedOnAccountant, true)
    assert.equal(input.reason, "Updated based on accountant advice")
  })
})
