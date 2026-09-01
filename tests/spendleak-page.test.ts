import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-1" }
let mockTier: string | null = "small_business"
let redirectedTo: string | null = null
let moduleGridModulesLength = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SpendLeakDashboardPage: any

describe("SpendLeak dashboard page", () => {
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

    await mock.module("@/lib/dashboard/loadDashboardProfile", {
      namedExports: {
        getDashboardProfile: async () => ({ subscriptionTier: mockTier }),
      },
    })

    await mock.module("@/lib/dashboard/loadSpendLeakDashboard", {
      namedExports: {
        loadSpendLeakDashboard: async () => ({
          findings: [
            {
              id: "finding-1",
              userId: "user-1",
              accountingConnectionId: null,
              findingType: "duplicate_payment",
              subjectKey: "sub-1",
              severity: "high",
              summary: "Possible duplicate",
              state: "open",
              estimatedMonthlyCents: null,
              estimatedAnnualCents: 30000,
              evidence: {},
              detectedAt: new Date("2026-09-01T00:00:00.000Z"),
              resolvedAt: null,
              createdAt: new Date("2026-09-01T00:00:00.000Z"),
              updatedAt: new Date("2026-09-01T00:00:00.000Z"),
            },
          ],
          modules: [
            {
              id: "duplicate_spend",
              title: "Duplicate spend",
              description: "desc",
              findingCount: 1,
              estimatedAnnualCents: 30000,
              severity: "red",
            },
          ],
          latestSyncAt: new Date("2026-09-01T00:00:00.000Z"),
          hasAccountingConnection: true,
          isStale: false,
        }),
      },
    })

    await mock.module("@/components/dashboard/spendleak/SpendLeakModuleGrid", {
      namedExports: {
        SpendLeakModuleGrid: ({ modules }: { modules: unknown[] }) => {
          moduleGridModulesLength = modules.length
          return { type: "mock-module-grid" } as unknown
        },
      },
    })

    await mock.module("@/components/dashboard/spendleak/SpendLeakFindingsTable", {
      namedExports: {
        SpendLeakFindingsTable: () => ({ type: "mock-findings-table" }) as unknown,
      },
    })

    ;({ default: SpendLeakDashboardPage } = await import("@/app/dashboard/spendleak/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockTier = "small_business"
    redirectedTo = null
    moduleGridModulesLength = 0
  })

  test("redirects to sign-in when unauthenticated", async () => {
    mockUser = null
    const result = await SpendLeakDashboardPage({ searchParams: Promise.resolve({}) }).catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/sign-in")
  })

  test("renders tier-gated lock state for ineligible tiers", async () => {
    mockTier = "starter"
    const element = await SpendLeakDashboardPage({ searchParams: Promise.resolve({}) })
    assert.equal(moduleGridModulesLength, 0)
    assert.equal(typeof element?.props?.children?.[0]?.props?.children, "string")
  })

  test("renders module grid for eligible tiers", async () => {
    const element = await SpendLeakDashboardPage({ searchParams: Promise.resolve({}) })
    assert.ok(element)
    assert.equal(redirectedTo, null)
  })
})
