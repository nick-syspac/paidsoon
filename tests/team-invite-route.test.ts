import { before, beforeEach, describe, test, mock } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let mockTier = "small_business"
let mockSeatLimit = 3
let mockTeamSeatsImplemented = false

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: any

describe("/api/settings/team/invite", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/billing", {
      namedExports: {
        getSubscriptionTier: async () => mockTier,
        getUserSeatLimitForTier: () => mockSeatLimit,
      },
    })

    await mock.module("@/lib/subscriptionPlans", {
      namedExports: {
        isFeatureImplemented: () => mockTeamSeatsImplemented,
      },
    })

    ;({ GET, POST } = await import("@/app/api/settings/team/invite/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockTier = "small_business"
    mockSeatLimit = 3
    mockTeamSeatsImplemented = false
  })

  test("GET returns feature availability metadata for Team seats", async () => {
    const res = await GET()
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.featureAvailability.teamSeats.implemented, false)
    assert.equal(body.featureAvailability.teamSeats.actionable, false)
  })

  test("POST returns deterministic unavailable response when Team seats are unimplemented", async () => {
    const req = new Request("http://localhost/api/settings/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "teammate@example.com" }),
    })

    const res = await POST(req)
    assert.equal(res.status, 409)

    const body = await res.json()
    assert.equal(body.code, "feature_not_implemented")
    assert.equal(body.feature, "team_seats")
    assert.equal(body.tier, "small_business")
  })

  test("POST uses seat-limit behavior when Team seats are implemented", async () => {
    mockTeamSeatsImplemented = true
    mockSeatLimit = 1

    const req = new Request("http://localhost/api/settings/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "teammate@example.com" }),
    })

    const res = await POST(req)
    assert.equal(res.status, 403)

    const body = await res.json()
    assert.equal(body.code, "seat_limit_reached")
  })
})
