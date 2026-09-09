import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-123" }
let settingsResponse = {
  enabled: true,
  emailEnabled: false,
  frequency: "weekly",
  deliveryDay: "monday",
  deliveryTime: "07:00",
  timezone: "Australia/Sydney",
  includeNeedsAttention: true,
  includeOpportunities: true,
  includePositiveChanges: true,
  includeKeyNumbers: true,
  maxActionItems: 5,
  minimumMaterialityCents: 10000,
  sendWhenEmpty: true,
  recipientScope: "owner_only",
}

let requireAccessThrows = false

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PUT: any

describe("Owner's Digest settings route", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/ownersDigest/entitlements", {
      namedExports: {
        requireOwnersDigestCoreAccess: async () => {
          if (requireAccessThrows) throw new Error("Upgrade required")
        },
      },
    })

    await mock.module("@/lib/ownersDigest/service", {
      namedExports: {
        loadOwnersDigestSettings: async () => settingsResponse,
        updateOwnersDigestSettings: async (_userId: string, input: typeof settingsResponse) => input,
      },
    })

    ;({ GET, PUT } = await import("@/app/api/owners-digest/settings/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    requireAccessThrows = false
    settingsResponse = {
      enabled: true,
      emailEnabled: false,
      frequency: "weekly",
      deliveryDay: "monday",
      deliveryTime: "07:00",
      timezone: "Australia/Sydney",
      includeNeedsAttention: true,
      includeOpportunities: true,
      includePositiveChanges: true,
      includeKeyNumbers: true,
      maxActionItems: 5,
      minimumMaterialityCents: 10000,
      sendWhenEmpty: true,
      recipientScope: "owner_only",
    }
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const response = await GET()
    assert.equal(response.status, 401)
  })

  test("returns 403 when user lacks access", async () => {
    requireAccessThrows = true
    const response = await GET()
    assert.equal(response.status, 403)
  })

  test("rejects invalid PUT payload", async () => {
    const response = await PUT(
      new Request("http://localhost/api/owners-digest/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: "hourly" }),
      }),
    )

    assert.equal(response.status, 400)
  })

  test("accepts valid PUT payload", async () => {
    const response = await PUT(
      new Request("http://localhost/api/owners-digest/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsResponse),
      }),
    )

    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.settings.frequency, "weekly")
    assert.equal(body.settings.maxActionItems, 5)
  })
})
