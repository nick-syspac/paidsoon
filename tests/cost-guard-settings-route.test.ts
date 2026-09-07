import { before, beforeEach, describe, test, mock } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let withUserContextCalls = 0
let upsertArgs: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PUT: any

describe("PUT /api/settings/cost-guard", () => {
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
          withUserContextCalls += 1
          const tx = {
            costGuardSetting: {
              upsert: async (args: unknown) => {
                upsertArgs = args
                return {
                  userId: "user-123",
                  materialityPercent: 25,
                  materialityCents: 25000,
                  defaultLookbackDays: 90,
                  alertDigestMode: "weekly",
                }
              },
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ PUT } = await import("@/app/api/settings/cost-guard/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    withUserContextCalls = 0
    upsertArgs = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null

    const req = new Request("http://localhost/api/settings/cost-guard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialityPercent: 25,
        materialityCents: 25000,
        defaultLookbackDays: 90,
        alertDigestMode: "weekly",
      }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 401)
  })

  test("rejects invalid payload values", async () => {
    const req = new Request("http://localhost/api/settings/cost-guard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialityPercent: 150,
        materialityCents: -1,
        defaultLookbackDays: 30,
        alertDigestMode: "hourly",
      }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 400)
    assert.equal(withUserContextCalls, 0)
  })

  test("accepts valid settings and upserts the user record", async () => {
    const req = new Request("http://localhost/api/settings/cost-guard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        materialityPercent: 25,
        materialityCents: 25000,
        defaultLookbackDays: 90,
        alertDigestMode: "weekly",
      }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.materialityPercent, 25)
    assert.equal(body.alertDigestMode, "weekly")
    assert.equal(withUserContextCalls, 1)

    const typedUpsert = upsertArgs as {
      update: { materialityPercent: number; materialityCents: number; defaultLookbackDays: number; alertDigestMode: string }
      create: { materialityPercent: number; materialityCents: number; defaultLookbackDays: number; alertDigestMode: string }
    }

    assert.equal(typedUpsert.update.materialityPercent, 25)
    assert.equal(typedUpsert.update.defaultLookbackDays, 90)
    assert.equal(typedUpsert.create.alertDigestMode, "weekly")
  })
})
