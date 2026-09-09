import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let mockCanAccess = true
let redirectedTo: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MarginGuardPage: any

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

describe("MarginGuard dashboard page", () => {
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

    await mock.module("@/lib/dashboard/marginguardAccess", {
      namedExports: {
        canAccessMarginGuard: () => mockCanAccess,
      },
    })

    await mock.module("@/lib/marginguard/service", {
      namedExports: {
        getMarginSummary: async () => ({
          period: { preset: "30d", start: "2026-08-01", end: "2026-08-31" },
          revenueCents: 200_000,
          directCostCents: 120_000,
          grossProfitCents: 80_000,
          grossMarginPercent: 40,
          targetGrossMarginPercent: 45,
          marginVariancePercent: -5,
          warnings: [],
          assumptions: { missingItems: [], notes: [] },
          confidence: "medium",
          completenessPercent: 82,
          customersBelowTargetCount: 2,
          alertsOpenCount: 1,
          marginAtRiskCents: 15_000,
        }),
        getMarginTrends: async () => ({
          period: { preset: "30d", start: "2026-08-01", end: "2026-08-31" },
          points: [
            {
              periodStart: "2026-08-01",
              periodEnd: "2026-08-15",
              revenueCents: 100_000,
              directCostCents: 60_000,
              grossProfitCents: 40_000,
              grossMarginPercent: 40,
              targetGrossMarginPercent: 45,
              marginVariancePercent: -5,
            },
          ],
        }),
        getMarginCustomers: async () => [
          {
            customerId: "cust-1",
            customerName: "Acme",
            revenueCents: 100_000,
            directCostCents: 70_000,
            grossProfitCents: 30_000,
            grossMarginPercent: 30,
            targetMarginPercent: 40,
            status: "warning",
            outstandingInvoicesCount: 1,
            latestPaymentAt: null,
            averageDaysToPay: null,
            confidence: "medium",
            completenessPercent: 80,
          },
        ],
        getMarginBreakdowns: async () => [
          {
            key: "inv-1",
            source: "invoice",
            label: "Invoice #100",
            revenueCents: 50_000,
            directCostCents: 30_000,
            grossProfitCents: 20_000,
            grossMarginPercent: 40,
            targetMarginPercent: 45,
            marginVariancePercent: -5,
            status: "watch",
            confidence: "high",
            completenessPercent: 90,
            invoicesCount: 1,
            latestAt: null,
          },
        ],
        listMarginAlerts: async () => [
          {
            id: "alert-1",
            alertCode: "below_warning",
            severity: "warning",
            state: "open",
            scopeType: "customer",
            scopeKey: "cust-1",
            title: "Customer below warning",
            message: "Acme has dropped below warning threshold.",
            metricValuePercent: 30,
            targetValuePercent: 40,
            variancePercent: -10,
            firstDetectedAt: "2026-09-01T00:00:00.000Z",
            lastDetectedAt: "2026-09-02T00:00:00.000Z",
            acknowledgedAt: null,
            resolvedAt: null,
            dismissedAt: null,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
          },
        ],
      },
    })

    ;({ default: MarginGuardPage } = await import("@/app/dashboard/margin-guard/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockCanAccess = true
    redirectedTo = null
  })

  test("redirects to sign-in when unauthenticated", async () => {
    mockUser = null
    const result = await MarginGuardPage({ searchParams: Promise.resolve({}) }).catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/sign-in")
  })

  test("redirects to dashboard intent when feature is unavailable", async () => {
    mockCanAccess = false
    const result = await MarginGuardPage({ searchParams: Promise.resolve({}) }).catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/dashboard?intent=marginguard")
  })

  test("renders key sections for eligible users", async () => {
    const element = await MarginGuardPage({ searchParams: Promise.resolve({ period: "30d" }) })
    const text = collectText(element)

    assert.match(text, /MarginGuard/)
    assert.match(text, /Gross Margin/)
    assert.match(text, /Customer profitability/)
    assert.match(text, /Invoice margin basis/)
    assert.match(text, /Customer below warning/)
    assert.match(text, /Data completeness is\s+82\.0\s*%/)
  })
})
