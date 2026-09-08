import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let redirectedTo: string | null = null
let tier = "small_business"
let featureFlags: Record<string, boolean> = {
  commitguard_core: true,
  commitguard_detection: true,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CommitGuardPage: any

function collectText(node: unknown): string {
  if (typeof node === "string") return node
  if (typeof node === "number") return String(node)
  if (!node || typeof node !== "object") return ""

  const element = node as { props?: { children?: unknown } }
  const children = element.props?.children
  if (Array.isArray(children)) return children.map((child) => collectText(child)).join(" ")
  if (children !== undefined) return collectText(children)
  return ""
}

describe("CommitGuard dashboard page", () => {
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
        getSubscriptionTier: async () => tier,
      },
    })

    await mock.module("@/lib/subscriptionPlans", {
      namedExports: {
        hasPlanFeature: (_tier: string, feature: string) => featureFlags[feature] ?? false,
      },
    })

    await mock.module("@/lib/commitguard/service", {
      namedExports: {
        summarizeCommitGuard: async () => ({
          settings: {
            enabled: true,
            defaultHorizonDays: 30,
            safetyBufferMode: "fixed_amount",
            safetyBufferFixedCents: 30_000,
            safetyBufferPercent: null,
            safetyBufferWeeks: null,
            detectRecurringCommitments: true,
            detectionMinOccurrences: 3,
            detectionAmountVariancePercent: 10,
            detectionIntervalToleranceDays: 3,
            detectionConfidenceThreshold: "medium",
            alertCommitmentDueSoon: true,
            alertRenewalApproaching: true,
            alertNoticePeriodApproaching: true,
            alertCommitmentAmountChanged: true,
            alertCommitmentBufferLow: true,
            alertCommitmentShortfall: true,
            renewalWarningDays: [90, 60, 30, 14, 7],
          },
          horizons: [
            {
              days: 30,
              totalCents: 120_000,
              confirmedCents: 100_000,
              probableCents: 20_000,
              potentialCents: 0,
              occurrences: 1,
            },
          ],
          renewals: [
            {
              commitmentId: "commitment-1",
              name: "Cloud plan",
              renewalDate: new Date("2026-10-15T00:00:00.000Z"),
              noticeCloseDate: new Date("2026-09-30T00:00:00.000Z"),
              severity: "urgent",
              daysToNoticeClose: 2,
            },
          ],
          freeCash: {
            availableCashCents: 500_000,
            commitmentsCents: 120_000,
            taxProtectedCents: 0,
            safetyBufferCents: 30_000,
            protectedCashCents: 150_000,
            freeCashCents: 350_000,
            status: "safe",
            notes: [],
          },
        }),
        listCommitments: async () => [
          {
            id: "commitment-1",
            userId: "user-1",
            name: "Cloud plan",
            description: null,
            category: "software",
            amountCents: 120_000,
            currency: "aud",
            frequency: "monthly",
            nextDueDate: new Date("2026-10-01T00:00:00.000Z"),
            startDate: null,
            endDate: null,
            recurrenceRule: null,
            supplierName: "Acme Cloud",
            supplierId: null,
            accountId: null,
            source: "manual",
            status: "active",
            confidence: "confirmed",
            noticePeriodDays: null,
            renewalDate: null,
            autoRenew: false,
            cancellable: true,
            essentiality: "operational",
            notes: null,
            linkedSpendInsightId: null,
            linkedCostGuardAlertId: "alert-123",
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            updatedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "commitment-2",
            userId: "user-1",
            name: "Insurance",
            description: null,
            category: "insurance",
            amountCents: 80_000,
            currency: "aud",
            frequency: "monthly",
            nextDueDate: new Date("2026-10-02T00:00:00.000Z"),
            startDate: null,
            endDate: null,
            recurrenceRule: null,
            supplierName: "Insurer",
            supplierId: null,
            accountId: null,
            source: "manual",
            status: "active",
            confidence: "high",
            noticePeriodDays: null,
            renewalDate: null,
            autoRenew: false,
            cancellable: true,
            essentiality: "essential",
            notes: null,
            linkedSpendInsightId: null,
            linkedCostGuardAlertId: "alert-999",
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            updatedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      },
    })

    await mock.module("@/lib/commitguard/detection", {
      namedExports: {
        listDetectedCommitmentCandidates: async () => [
          {
            id: "candidate-1",
            userId: "user-1",
            name: "Detected cloud",
            category: "software",
            frequency: "monthly",
            typicalAmountCents: 110_000,
            confidence: "high",
            source: "spendleak",
            status: "pending",
            evidence: {},
            firstObservedAt: new Date("2026-09-01T00:00:00.000Z"),
            lastObservedAt: new Date("2026-09-01T00:00:00.000Z"),
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            updatedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
      },
    })

    await mock.module("@/components/dashboard/commitguard/CommitGuardWorkspace", {
      namedExports: {
        CommitGuardWorkspace: () => ({ type: "mock-commitguard-workspace" }) as unknown,
      },
    })

    ;({ default: CommitGuardPage } = await import("@/app/dashboard/commitguard/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    redirectedTo = null
    tier = "small_business"
    featureFlags = {
      commitguard_core: true,
      commitguard_detection: true,
    }
  })

  test("redirects unauthenticated users to sign-in", async () => {
    mockUser = null

    const result = await CommitGuardPage({ searchParams: Promise.resolve({}) }).catch((error: unknown) => error)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/sign-in")
  })

  test("redirects users without core entitlement to dashboard intent", async () => {
    featureFlags.commitguard_core = false

    const result = await CommitGuardPage({ searchParams: Promise.resolve({}) }).catch((error: unknown) => error)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/dashboard?intent=commitguard")
  })

  test("renders metrics, upcoming commitments, and renewal severity labels", async () => {
    const element = await CommitGuardPage({ searchParams: Promise.resolve({}) })
    const text = collectText(element)

    assert.ok(element)
    assert.equal(redirectedTo, null)
    assert.match(text, /CommitGuard/)
    assert.match(text, /Committed \(next 30 days\)/)
    assert.match(text, /Cloud plan/)
    assert.match(text, /Insurance/)
    assert.match(text, /Renewals and notice windows/)
    assert.match(text, /Urgent\s*\(\s*2\s*days to notice close\)/)
  })

  test("applies Cost Guard deep-link filter and keeps detected-commitment UI signals", async () => {
    const element = await CommitGuardPage({
      searchParams: Promise.resolve({ costGuardAlertId: "alert-123" }),
    })

    const text = collectText(element)
    assert.match(text, /Filtered to commitments linked to Cost Guard alert\s+alert-123\s*\./)
    assert.match(text, /Cloud plan/)
    assert.doesNotMatch(text, /Insurance/)
    assert.match(text, /Detected commitments\s+1/)
    assert.match(text, /Pending review queue/)
  })
})
