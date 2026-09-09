import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let mockHasFeature = true
let redirectedTo: string | null = null
let mockEnabled = true
let mockSummaryHealth = "unknown"
let mockWarnings: string[] = []
let mockObligations: Array<{
  id: string
  categoryName: string
  categoryType: string
  name: string
  dueDate: string
  estimatedAmountCents: number
  reservedAmountCents: number
  shortfallCents: number
  status: string
  confidence: string
  source: string
}> = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TaxBufferPage: any

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

describe("Tax Buffer dashboard page", () => {
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
        getSubscriptionTier: async () => "small_business",
      },
    })

    await mock.module("@/lib/subscriptionPlans", {
      namedExports: {
        hasPlanFeature: () => mockHasFeature,
      },
    })

    await mock.module("@/lib/taxBuffer/service", {
      namedExports: {
        loadTaxBufferSummary: async () => ({
          accountingBasis: "cash",
          availableCashCents: 200_000,
          committedOutflowsCents: 20_000,
          totalRequiredReserveCents: 80_000,
          totalReservedCents: 25_000,
          reserveGapCents: 55_000,
          safeToSpendCents: 100_000,
          healthStatus: mockSummaryHealth,
          warnings: mockWarnings,
          categories: [
            {
              categoryId: "cat-1",
              type: "gst",
              name: "GST",
              requiredReserveCents: 40_000,
              reservedCents: 10_000,
              shortfallCents: 30_000,
              confidence: "medium",
              source: "integration",
              explainability: ["sample"],
            },
          ],
          recommendation: {
            transferNowCents: 55_000,
            weeklyTargetCents: 5_000,
            reasons: ["GST shortfall: 30000"],
          },
        }),
        getTaxBufferSettings: async () => ({
          configuration: { enabled: mockEnabled },
          categories: [],
          suggestedDefaults: {
            available: false,
            reasons: [],
            values: {
              enabled: false,
              gstRegistered: false,
              accountingBasis: "cash",
              gstFrequency: "quarterly",
              reserveBalanceSource: "manual",
              businessType: "other",
            },
          },
        }),
        listTaxBufferObligations: async () => ({ obligations: mockObligations }),
      },
    })

    ;({ default: TaxBufferPage } = await import("@/app/dashboard/tax-buffer/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockHasFeature = true
    redirectedTo = null
    mockEnabled = true
    mockSummaryHealth = "unknown"
    mockWarnings = []
    mockObligations = []
  })

  test("redirects to sign-in when unauthenticated", async () => {
    mockUser = null
    const result = await TaxBufferPage().catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/sign-in")
  })

  test("redirects to dashboard intent when feature is unavailable", async () => {
    mockHasFeature = false
    const result = await TaxBufferPage().catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/dashboard?intent=tax_buffer")
  })

  test("renders setup and empty states with warnings", async () => {
    mockEnabled = false
    mockWarnings = ["stale source data", "Available cash is missing"]
    mockSummaryHealth = "unknown"

    const element = await TaxBufferPage()
    const text = collectText(element)

    assert.match(text, /Finish setup to unlock reliable safe-to-spend numbers/)
    assert.match(text, /No obligations currently configured/)
    assert.match(text, /Data quality warning/)
    assert.match(text, /stale source data/)
    assert.match(text, /unknown/)
  })

  test("renders critical status and obligations table", async () => {
    mockSummaryHealth = "critical"
    mockObligations = [
      {
        id: "obl-1",
        categoryName: "GST",
        categoryType: "gst",
        name: "BAS Q1",
        dueDate: "2026-10-01T00:00:00.000Z",
        estimatedAmountCents: 20000,
        reservedAmountCents: 5000,
        shortfallCents: 15000,
        status: "open",
        confidence: "medium",
        source: "integration",
      },
    ]

    const element = await TaxBufferPage()
    const text = collectText(element)
    const serialized = JSON.stringify(element)

    assert.match(text, /critical/)
    assert.match(text, /BAS Q1/)
    assert.match(text, /Upcoming obligations \(90 days\)/)
    assert.match(serialized, /overflow-x-auto/)
    assert.match(serialized, /md:grid-cols-2/)
  })

  test("renders underfunded health state", async () => {
    mockSummaryHealth = "underfunded"

    const element = await TaxBufferPage()
    const text = collectText(element)

    assert.match(text, /underfunded/)
  })
})
