import { before, beforeEach, describe, test, mock } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }
let mockTier = "small_business"
let mockSeatLimit = 3
let mockTeamSeatsImplemented = false
let redirectedTo: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TeamSettingsPage: any

describe("Team settings page", () => {
  before(async () => {
    await mock.module("next/navigation", {
      namedExports: {
        redirect: (url: string) => {
          redirectedTo = url
          throw new Error("NEXT_REDIRECT")
        },
      },
    })

    await mock.module("@/lib/supabase/server", {
      namedExports: {
        getAuthenticatedUser: async () => ({ data: { user: mockUser } }),
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

    await mock.module("@/components/settings/TeamInvitesClient", {
      namedExports: {
        TeamInvitesClient: ({ initial }: { initial: unknown }) =>
          ({ type: "mock-team-client", props: { initial } }) as unknown,
      },
    })

    ;({ default: TeamSettingsPage } = await import("@/app/dashboard/settings/team/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockTier = "small_business"
    mockSeatLimit = 3
    mockTeamSeatsImplemented = false
    redirectedTo = null
  })

  test("passes non-actionable implementation state to TeamInvitesClient when team seats are unimplemented", async () => {
    const element = await TeamSettingsPage()
    assert.equal(element?.props?.initial?.tier, "small_business")
    assert.equal(element?.props?.initial?.seatLimit, 3)
    assert.equal(element?.props?.initial?.teamSeatsImplemented, false)
    assert.equal(element?.props?.initial?.availableSeats, 2)
  })

  test("passes actionable implementation state when team seats are implemented", async () => {
    mockTeamSeatsImplemented = true
    const element = await TeamSettingsPage()
    assert.equal(element?.props?.initial?.teamSeatsImplemented, true)
  })

  test("redirects to sign-in when unauthenticated", async () => {
    mockUser = null
    const result = await TeamSettingsPage().catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) {
      assert.equal(result.message, "NEXT_REDIRECT")
    }
    assert.equal(redirectedTo, "/sign-in")
  })
})
