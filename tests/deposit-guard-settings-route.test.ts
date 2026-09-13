import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user_1" }
let getShouldThrowUpgrade = false
let putShouldThrowUpgrade = false

describe("DepositGuard settings route", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      exports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/depositGuard/settings", {
      exports: {
        getDepositGuardSettings: async () => {
          if (getShouldThrowUpgrade) throw new Error("Upgrade required")
          return {
            id: "cfg_1",
            userId: "user_1",
            autoReminderEnabled: true,
            initialReminderOffsetDays: 0,
            beforeDueOffsetDays: 1,
            overdue3Enabled: true,
            overdue7Enabled: true,
            paymentProviderDefault: "manual_external_link",
            requireDepositBeforeStart: true,
            settingsJson: null,
            createdAt: new Date("2026-09-12T00:00:00.000Z"),
            updatedAt: new Date("2026-09-12T00:00:00.000Z"),
          }
        },
        saveDepositGuardSettings: async () => {
          if (putShouldThrowUpgrade) throw new Error("Upgrade required")
          return {
            id: "cfg_1",
            userId: "user_1",
            autoReminderEnabled: true,
            initialReminderOffsetDays: 0,
            beforeDueOffsetDays: 1,
            overdue3Enabled: true,
            overdue7Enabled: true,
            paymentProviderDefault: "manual_external_link",
            requireDepositBeforeStart: true,
            settingsJson: null,
            createdAt: new Date("2026-09-12T00:00:00.000Z"),
            updatedAt: new Date("2026-09-12T00:00:00.000Z"),
          }
        },
      },
    })
  })

  beforeEach(() => {
    mockUser = { id: "user_1" }
    getShouldThrowUpgrade = false
    putShouldThrowUpgrade = false
  })

  test("GET returns 401 when unauthenticated", async () => {
    mockUser = null
    const { GET } = await import("@/app/api/deposit-guard/settings/route")
    const response = await GET()
    const body = await response.json()

    assert.equal(response.status, 401)
    assert.deepEqual(body, { error: "Unauthorized" })
  })

  test("GET returns 403 when feature is unavailable", async () => {
    getShouldThrowUpgrade = true
    const { GET } = await import("@/app/api/deposit-guard/settings/route")

    const response = await GET()
    const body = await response.json()

    assert.equal(response.status, 403)
    assert.deepEqual(body, { error: "Upgrade required" })
  })

  test("PUT validates request payload", async () => {
    const { PUT } = await import("@/app/api/deposit-guard/settings/route")
    const response = await PUT(
      new Request("http://localhost/api/deposit-guard/settings", {
        method: "PUT",
        body: JSON.stringify({ autoReminderEnabled: true }),
        headers: { "content-type": "application/json" },
      }),
    )

    assert.equal(response.status, 400)
  })
})
