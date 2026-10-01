import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-1" }
let mockTier: string | null = "small_business"
let redirectedTo: string | null = null
let moduleGridModulesLength = 0
let mockDashboardData = {
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
      reviewAction: "cancel",
      reviewActionAt: new Date("2026-09-01T12:00:00.000Z"),
      reviewActionBy: "user-1",
      reviewNote: "Cancelled duplicate subscription",
      estimatedMonthlyCents: null,
      estimatedAnnualCents: 30000,
      evidence: { source: "expense_import" },
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
  sourceSyncCount: 3,
  enabledSourceTypes: ["bills", "bank_transactions", "suppliers"],
  expectedSourceCount: 3,
  syncedExpectedSourceCount: 3,
  selectedSourceCoverage: [
    {
      sourceType: "bills",
      synced: true,
      recordCount: 3,
      latestSyncedAt: new Date("2026-09-01T00:00:00.000Z"),
    },
    {
      sourceType: "bank_transactions",
      synced: true,
      recordCount: 6,
      latestSyncedAt: new Date("2026-09-01T00:00:00.000Z"),
    },
    {
      sourceType: "suppliers",
      synced: true,
      recordCount: 2,
      latestSyncedAt: new Date("2026-09-01T00:00:00.000Z"),
    },
  ],
  selectedSourcesWithDataCount: 3,
  selectedSourcesWithoutDataCount: 0,
  status: {
    state: "ready",
    title: "SpendLeak ready",
    description: "Spend data is current and SpendLeak findings are available.",
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SpendLeakDashboardPage: any

function collectText(node: unknown): string {
  if (typeof node === "string") return node
  if (!node || typeof node !== "object") return ""

  const element = node as { props?: { children?: unknown } }
  const children = element.props?.children
  if (Array.isArray(children)) {
    return children.map((child) => collectText(child)).join(" ")
  }
  if (children !== undefined) {
    return collectText(children)
  }
  return ""
}

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
        loadSpendLeakDashboard: async () => mockDashboardData,
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
    mockDashboardData = {
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
          reviewAction: "cancel",
          reviewActionAt: new Date("2026-09-01T12:00:00.000Z"),
          reviewActionBy: "user-1",
          reviewNote: "Cancelled duplicate subscription",
          estimatedMonthlyCents: null,
          estimatedAnnualCents: 30000,
          evidence: { source: "expense_import" },
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
      sourceSyncCount: 3,
      enabledSourceTypes: ["bills", "bank_transactions", "suppliers"],
      expectedSourceCount: 3,
      syncedExpectedSourceCount: 3,
      selectedSourceCoverage: [
        {
          sourceType: "bills",
          synced: true,
          recordCount: 3,
          latestSyncedAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          sourceType: "bank_transactions",
          synced: true,
          recordCount: 6,
          latestSyncedAt: new Date("2026-09-01T00:00:00.000Z"),
        },
        {
          sourceType: "suppliers",
          synced: true,
          recordCount: 2,
          latestSyncedAt: new Date("2026-09-01T00:00:00.000Z"),
        },
      ],
      selectedSourcesWithDataCount: 3,
      selectedSourcesWithoutDataCount: 0,
      status: {
        state: "ready",
        title: "SpendLeak ready",
        description: "Spend data is current and SpendLeak findings are available.",
      },
    }
  })

  test("redirects to sign-in when unauthenticated", async () => {
    mockUser = null
    const result = await SpendLeakDashboardPage({ searchParams: Promise.resolve({}) }).catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/sign-in")
  })

  test("renders tier-gated lock state for ineligible tiers", async () => {
    mockTier = "essentials"
    const element = await SpendLeakDashboardPage({ searchParams: Promise.resolve({}) })
    assert.equal(moduleGridModulesLength, 0)
    assert.equal(typeof element?.props?.children?.[0]?.props?.children, "string")
  })

  test("renders module grid for eligible tiers", async () => {
    const element = await SpendLeakDashboardPage({ searchParams: Promise.resolve({}) })
    assert.ok(element)
    assert.equal(redirectedTo, null)
    const text = collectText(element)
    assert.match(text, /1 Expense import/)
    assert.match(text, /1 Cancel/)
    assert.equal(text.includes("Synced source coverage"), false)
  })

  test("renders selected-source coverage in empty state for bank-only synced data", async () => {
    mockDashboardData = {
      ...mockDashboardData,
      findings: [],
      latestSyncAt: new Date("2026-09-05T08:30:00.000Z"),
      enabledSourceTypes: ["bank_transactions"],
      expectedSourceCount: 1,
      syncedExpectedSourceCount: 1,
      selectedSourceCoverage: [
        {
          sourceType: "bank_transactions",
          synced: true,
          recordCount: 24,
          latestSyncedAt: new Date("2026-09-05T08:30:00.000Z"),
        },
      ],
      selectedSourcesWithDataCount: 1,
      selectedSourcesWithoutDataCount: 0,
      status: {
        state: "empty",
        title: "No spend findings yet",
        description:
          "All selected spend sources have synced, but SpendLeak has not identified a supported opportunity yet.",
      },
    }

    const element = await SpendLeakDashboardPage({ searchParams: Promise.resolve({}) })
    const text = collectText(element)
    assert.match(text, /Synced source coverage/)
    assert.match(text, /Bank transactions/)
    assert.match(text, /24\s+records/)
    assert.match(text, /alert-grade rule triggers/i)
  })
})
