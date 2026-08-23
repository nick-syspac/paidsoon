import { before, beforeEach, describe, test, mock } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let canUseCustomReplyTo = false
let canUseVerifiedDomain = false
let withUserContextCalls = 0
let upsertArgs: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PUT: any

describe("PUT /api/settings/email", () => {
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
        requireFeature: async (_userId: string, feature: string) => {
          if (feature === "custom_reply_to") return canUseCustomReplyTo
          if (feature === "verified_from_domain") return canUseVerifiedDomain
          return false
        },
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          withUserContextCalls += 1
          const tx = {
            emailSettings: {
              findUnique: async () => ({ fromEmail: "onboarding@paidsoon.com.au" }),
              upsert: async (args: unknown) => {
                upsertArgs = args
                return {}
              },
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ PUT } = await import("@/app/api/settings/email/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    canUseCustomReplyTo = false
    canUseVerifiedDomain = false
    withUserContextCalls = 0
    upsertArgs = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const req = new Request("http://localhost/api/settings/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromEmail: "hello@example.com",
        fromName: "Acme",
        replyTo: "reply@example.com",
      }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 401)
  })

  test("returns 403 for Starter-tier reply-to update attempts", async () => {
    const req = new Request("http://localhost/api/settings/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromEmail: "hello@example.com",
        fromName: "Acme",
        replyTo: "reply@example.com",
      }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 403)
    const body = await res.json()
    assert.equal(body.error, "A Solo or Small Business subscription is required to set a custom reply-to")
    assert.equal(withUserContextCalls, 0)
  })

  test("accepts reply-to updates for Solo+ users", async () => {
    canUseCustomReplyTo = true

    const req = new Request("http://localhost/api/settings/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromEmail: "hello@example.com",
        fromName: "Acme",
        replyTo: "reply@example.com",
      }),
    })

    const res = await PUT(req)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.success, true)

    const typedUpsert = upsertArgs as {
      update: { replyTo?: string }
      create: { replyTo?: string }
    }
    assert.equal(typedUpsert.update.replyTo, "reply@example.com")
    assert.equal(typedUpsert.create.replyTo, "reply@example.com")
  })
})
