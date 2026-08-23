import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"

type GuardContext = {
  userId: string
  userEmail: string
  platformRole: { role: "platform_support" | "platform_admin" }
  adminSession: { id: string }
}

const guardContext: GuardContext = {
  userId: "admin-1",
  userEmail: "admin@paidsoon.com",
  platformRole: { role: "platform_support" },
  adminSession: { id: "session-1" },
}

let loggedEvents: Array<{ action: string; success: boolean; details?: unknown }> = []
let userProfileFindManyTake: number | undefined

const authRows = [
  { id: "user-1", email: "alice@example.com" },
  { id: "user-2", email: "bob@example.com" },
]

const profiles = [
  {
    userId: "user-1",
    displayName: "Alice",
    subscriptionTier: "starter",
    subscriptionStatus: "active",
    stripeCustomerId: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
  },
  {
    userId: "user-2",
    displayName: "Bob",
    subscriptionTier: "solo",
    subscriptionStatus: "trialing",
    stripeCustomerId: "cus_123",
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
  },
]

let GET: (request: NextRequest) => Promise<Response>

describe("admin customer search route", () => {
  before(async () => {
    await mock.module("@/lib/admin/guard", {
      namedExports: {
        requireAdminElevation: async () => guardContext,
      },
    })

    await mock.module("@/lib/admin/audit", {
      namedExports: {
        logAdminEvent: async (input: { action: string; success: boolean; details?: unknown }) => {
          loggedEvents.push(input)
        },
      },
    })

    await mock.module("@/lib/admin/request", {
      namedExports: {
        getIpAddress: () => "127.0.0.1",
        getUserAgent: () => "node-test",
        generateRequestId: () => "req-1",
      },
    })

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          $queryRaw: async () => authRows,
          userProfile: {
            findMany: async (args: { take: number }) => {
              userProfileFindManyTake = args.take
              return profiles.slice(0, args.take)
            },
          },
          adminAuditEvent: {
            findFirst: async () => ({ createdAt: new Date("2026-08-20T00:00:00.000Z") }),
          },
        },
      },
    })

    ;({ GET } = await import("@/app/api/admin/customers/search/route"))
  })

  beforeEach(() => {
    loggedEvents = []
    userProfileFindManyTake = undefined
  })

  test("returns paginated results and logs successful searches", async () => {
    const request = new NextRequest("http://localhost/api/admin/customers/search?q=ali&limit=1")
    const response = await GET(request)

    assert.equal(response.status, 200)

    const body = (await response.json()) as {
      results: Array<{ userId: string; email: string; lastSeenAt: string | null }>
    }

    assert.equal(body.results.length, 1)
    assert.equal(body.results[0]?.userId, "user-1")
    assert.equal(body.results[0]?.email, "alice@example.com")
    assert.equal(typeof body.results[0]?.lastSeenAt, "string")
    assert.equal(userProfileFindManyTake, 1)

    assert.equal(loggedEvents.length, 1)
    assert.equal(loggedEvents[0]?.action, "customer_search")
    assert.equal(loggedEvents[0]?.success, true)
  })

  test("rejects invalid short query and logs failed search", async () => {
    const request = new NextRequest("http://localhost/api/admin/customers/search?q=ab")
    const response = await GET(request)

    assert.equal(response.status, 400)
    const body = (await response.json()) as { error: string }
    assert.equal(body.error, "Invalid search query")

    assert.equal(loggedEvents.length, 1)
    assert.equal(loggedEvents[0]?.action, "customer_search")
    assert.equal(loggedEvents[0]?.success, false)
  })
})
