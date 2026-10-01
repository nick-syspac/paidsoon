import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-123" }
let mockTier = "small_business"
let getSettingsCalls = 0
let updateSettingsCalls = 0
let updatedEnabledSourceTypes: string[] | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PUT: any

describe("/api/settings/spendleak", () => {
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
        getSubscriptionTier: async () => mockTier,
      },
    })

    await mock.module("@/lib/spendleak/sourceSettings", {
      namedExports: {
        getSpendLeakSourceSettings: async () => {
          getSettingsCalls += 1
          return {
            enabledSourceTypes: ["bills", "bank_transactions", "suppliers"],
            isDefault: true,
          }
        },
        updateSpendLeakSourceSettings: async (_userId: string, enabledSourceTypes: string[]) => {
          updateSettingsCalls += 1
          updatedEnabledSourceTypes = enabledSourceTypes
          return {
            enabledSourceTypes,
            isDefault: false,
          }
        },
        spendLeakSourceSettingsUpdateSchema: {
          safeParse: (payload: unknown) => {
            if (!payload || typeof payload !== "object") {
              return {
                success: false as const,
                error: { flatten: () => ({ formErrors: ["Invalid payload"] }) },
              }
            }

            const sourceTypes = (payload as { enabledSourceTypes?: unknown }).enabledSourceTypes
            if (!Array.isArray(sourceTypes) || sourceTypes.length === 0) {
              return {
                success: false as const,
                error: { flatten: () => ({ formErrors: ["Select at least one spend source"] }) },
              }
            }

            const allowed = new Set(["bills", "bank_transactions", "suppliers"])
            if (sourceTypes.some((value) => typeof value !== "string" || !allowed.has(value))) {
              return {
                success: false as const,
                error: { flatten: () => ({ formErrors: ["Unsupported source key"] }) },
              }
            }

            return {
              success: true as const,
              data: { enabledSourceTypes: sourceTypes as string[] },
            }
          },
        },
      },
    })

    ;({ GET, PUT } = await import("@/app/api/settings/spendleak/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockTier = "small_business"
    getSettingsCalls = 0
    updateSettingsCalls = 0
    updatedEnabledSourceTypes = null
  })

  test("GET returns 401 when unauthenticated", async () => {
    mockUser = null
    const response = await GET()
    assert.equal(response.status, 401)
  })

  test("GET returns 403 when tier lacks SpendLeak access", async () => {
    mockTier = "essentials"
    const response = await GET()
    assert.equal(response.status, 403)
  })

  test("GET returns resolved source settings", async () => {
    const response = await GET()
    assert.equal(response.status, 200)
    assert.equal(getSettingsCalls, 1)

    const body = (await response.json()) as {
      settings: { enabledSourceTypes: string[]; isDefault: boolean }
    }
    assert.deepEqual(body.settings.enabledSourceTypes, ["bills", "bank_transactions", "suppliers"])
    assert.equal(body.settings.isDefault, true)
  })

  test("PUT rejects empty source selection", async () => {
    const request = new Request("http://localhost/api/settings/spendleak", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledSourceTypes: [] }),
    })

    const response = await PUT(request)
    assert.equal(response.status, 400)
    assert.equal(updateSettingsCalls, 0)
  })

  test("PUT rejects unsupported source keys", async () => {
    const request = new Request("http://localhost/api/settings/spendleak", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledSourceTypes: ["bills", "unexpected"] }),
    })

    const response = await PUT(request)
    assert.equal(response.status, 400)
    assert.equal(updateSettingsCalls, 0)
  })

  test("PUT persists valid source selection", async () => {
    const request = new Request("http://localhost/api/settings/spendleak", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabledSourceTypes: ["bills", "suppliers"] }),
    })

    const response = await PUT(request)
    assert.equal(response.status, 200)
    assert.equal(updateSettingsCalls, 1)
    assert.deepEqual(updatedEnabledSourceTypes, ["bills", "suppliers"])

    const body = (await response.json()) as {
      settings: { enabledSourceTypes: string[]; isDefault: boolean }
    }
    assert.deepEqual(body.settings.enabledSourceTypes, ["bills", "suppliers"])
    assert.equal(body.settings.isDefault, false)
  })
})
