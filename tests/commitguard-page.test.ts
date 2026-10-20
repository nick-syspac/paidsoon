import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { syntheticWorkspace } from "@/tests/helpers/commitGuardWorkspace"
import { selectWorkspaceCommitments, type WorkspaceQuery } from "@/lib/commitguard/workspaceFilters"

let mockUser: { id: string } | null = { id: "user-1" }
let redirectedTo: string | null = null
let tier = "small_business"
let featureFlags: Record<string, boolean> = {
  commitguard_core: true,
  commitguard_detection: true,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CommitGuardPage: any

describe("CommitGuard dashboard page", () => {
  before(async () => {
    await mock.module("@/lib/commitguard/alertHistory", { namedExports: {
      listCommitGuardAlerts: async () => ({ alerts: [], page: 1, totalPages: 1, total: 0,
        evaluation: { available: false, lastEvaluatedAt: null }, eventFound: true }),
      loadAlertCommitment: async () => null,
    } })
    await mock.module("next/navigation", {
      namedExports: {
        useRouter: () => ({ refresh: () => {} }),
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
          version: 2, inputRevision: 4, calculationRevision: 9, asOf: "2026-10-19T12:00:00Z",
          enabled: true, selectedHorizonDays: 30, currency: "aud",
          cashContext: { amountCents: 500000, currency: "aud", balanceAsOf: "2026-10-19", freshness: "fresh", source: "owner_entered" },
          quality: { state: "complete", reasons: [], actions: [] },
          horizonsByCurrency: [{ currency: "aud", supportedForFreeCash: true, horizons: [{
            days: 30, totalCents: 120000, confirmedCents: 100000, probableCents: 20000, potentialCents: 0,
          }] }],
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
            currency: "aud",
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
        CommitGuardWorkspace: () => null,
      },
    })

    await mock.module("@/lib/commitguard/workspaceLoader", { namedExports: {
      loadCommitGuardWorkspace: async (_userId: string, query: WorkspaceQuery) => {
        const dto = syntheticWorkspace(9, 4)
        dto.commitments = [
          { ...dto.commitments[0], name: "Cloud plan", linkedCostGuardAlertId: "alert-123" },
          { ...dto.commitments[0], id: "commitment-2", name: "Insurance", linkedCostGuardAlertId: "alert-other" },
        ]
        dto.reviewCount = 1
        dto.upcoming = selectWorkspaceCommitments(dto.commitments, query, dto.asOf)
        dto.summary.renewals[0] = { ...dto.summary.renewals[0], name: "Cloud plan", severity: "urgent", daysToNoticeClose: 2 }
        return dto
      },
    } })
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
    const text = renderToStaticMarkup(element)

    assert.ok(element)
    assert.equal(redirectedTo, null)
    assert.match(text, /CommitGuard/)
    assert.match(text, /Committed \(next 30 days\)/)
    assert.match(text, /Cloud plan/)
    assert.match(text, /Insurance/)
    assert.match(text, /Renewals and notice windows/)
    assert.match(text, /Urgent · 2 days remaining to act/)
    assert.match(text, /Annualized impact:/)
    assert.match(text, /Renewal pagination/)
  })

  test("applies Cost Guard deep-link filter and keeps detected-commitment UI signals", async () => {
    const element = await CommitGuardPage({
      searchParams: Promise.resolve({ costGuardAlertId: "alert-123" }),
    })

    const text = renderToStaticMarkup(element)
    assert.match(text, /Filtered to commitments linked to Cost Guard alert\s+alert-123\s*\./)
    assert.match(text, /Cloud plan/)
    assert.doesNotMatch(text, /Insurance/)
    assert.match(text, /Detected commitments\s+1/)
    assert.match(text, /Pending review queue/)
  })

  test("7.3 server page validates URL arrays, unknown keys, enums and UTC ranges with a safe reset", async () => {
    for (const params of [{ page: ["1", "2"] }, { status: "unknown" }, { userId: "foreign" },
      { dueFrom: "2026-10-20", dueTo: "2026-10-19" }, { source: "manual", sortBy: "constructor" }]) {
      const html = renderToStaticMarkup(await CommitGuardPage({ searchParams: Promise.resolve(params) }))
      assert.match(html, /role="alert"/); assert.match(html, /Reset workspace filters/)
      assert.doesNotMatch(html, /Cloud plan|Insurance|foreign|constructor/)
    }
    const html = renderToStaticMarkup(await CommitGuardPage({ searchParams: Promise.resolve({ search: "", category: "", page: "-1" }) }))
    assert.match(html, /Page 1 of 1/)
  })
})
