import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let mockHasAccess = true
let updateArgs: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PUT: any

describe("PUT /api/margin-guard/settings", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/marginguard/entitlements", {
      namedExports: {
        requireMarginGuardCoreAccess: async () => {
          if (!mockHasAccess) throw new Error("Upgrade required")
        },
      },
    })

    await mock.module("@/lib/marginguard/engine", {
      namedExports: {
        validateMarginThresholds: () => true,
      },
    })

    await mock.module("@/lib/marginguard/service", {
      namedExports: {
        getOrCreateMarginSettings: async () => ({
          targetGrossMarginPercent: 40,
          warningGrossMarginPercent: 35,
          criticalGrossMarginPercent: 30,
        }),
        updateMarginSettings: async (_userId: string, payload: unknown) => {
          updateArgs = payload
          return {
            enabled: true,
            defaultPeriod: "30d",
            targetGrossMarginPercent: 40,
            warningGrossMarginPercent: 35,
            criticalGrossMarginPercent: 30,
            minCompletenessPercent: 70,
            alertBelowWarning: true,
            alertBelowCritical: true,
            alertDeterioration: true,
            alertNegativeMargin: true,
            alertCustomerMarginWarning: true,
            alertCostIncrease: true,
            alertDataQualityWarning: true,
            alertDigestMode: "weekly",
          }
        },
      },
    })

    ;({ PUT } = await import("@/app/api/margin-guard/settings/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockHasAccess = true
    updateArgs = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const req = new Request("http://localhost/api/margin-guard/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertDigestMode: "weekly" }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 401)
  })

  test("returns 403 when feature is unavailable", async () => {
    mockHasAccess = false
    const req = new Request("http://localhost/api/margin-guard/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertDigestMode: "weekly" }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 403)
  })

  test("rejects invalid digest mode", async () => {
    const req = new Request("http://localhost/api/margin-guard/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertDigestMode: "hourly" }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 400)
  })

  test("accepts valid digest mode and forwards payload", async () => {
    const req = new Request("http://localhost/api/margin-guard/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertDigestMode: "weekly" }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.settings.alertDigestMode, "weekly")

    const typedPayload = updateArgs as { alertDigestMode?: string }
    assert.equal(typedPayload.alertDigestMode, "weekly")
  })
})
