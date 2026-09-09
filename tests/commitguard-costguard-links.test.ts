import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let costGuardAlerts: Array<{
  id: string
  severity: string
  title: string
  description: string
  varianceAmountCents: number
  variancePercent: number
  alertType: string
}> = []
let commitGuardCommitments: Array<{ name: string; linkedCostGuardAlertId: string | null }> = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CostGuardDashboardPage: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CommitGuardDashboardPage: any

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

function collectHrefs(node: unknown): string[] {
  if (!node || typeof node !== "object") return []

  const element = node as { props?: { href?: unknown; children?: unknown } }
  const href = typeof element.props?.href === "string" ? [element.props.href] : []
  const children = element.props?.children

  if (Array.isArray(children)) {
    return [...href, ...children.flatMap((child) => collectHrefs(child))]
  }

  if (children !== undefined) {
    return [...href, ...collectHrefs(children)]
  }

  return href
}

describe("CommitGuard and Cost Guard linkage", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        getAuthenticatedUser: async () => ({ data: { user: mockUser } }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            costGuardForecast: {
              findFirst: async () => ({
                forecastMonth: new Date("2026-09-01T00:00:00.000Z"),
                actualSpendCents: 300_000,
                projectedMonthEndCents: 420_000,
                varianceAmountCents: 20_000,
                variancePercent: 5,
                recurringCommitmentsCents: 120_000,
                expectedVariableSpendCents: 300_000,
              }),
            },
            costGuardAlert: {
              findMany: async () => costGuardAlerts,
            },
          }

          return fn(tx)
        },
      },
    })

    await mock.module("@/lib/dashboard/loadSpendLeakDashboard", {
      namedExports: {
        loadSpendLeakDashboard: async () => ({
          findings: [],
          linkedCommitmentCountsByFindingId: {},
          modules: [],
          latestSyncAt: null,
          hasAccountingConnection: true,
          isStale: false,
          sourceSyncCount: 0,
          status: {
            state: "empty",
            title: "No data",
            description: "",
          },
        }),
      },
    })

    await mock.module("@/lib/billing", {
      namedExports: {
        getSubscriptionTier: async () => "small_business",
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
              confirmedCents: 120_000,
              probableCents: 0,
              potentialCents: 0,
              occurrences: 1,
            },
          ],
          renewals: [],
          freeCash: {
            protectedCashCents: 150_000,
            freeCashCents: 350_000,
            status: "safe",
            safetyBufferCents: 30_000,
            commitmentsCents: 120_000,
            taxProtectedCents: 0,
            availableCashCents: 500_000,
          },
        }),
        listCommitments: async () =>
          commitGuardCommitments.map((commitment, index) => ({
            id: `commitment-${index + 1}`,
            userId: "user-1",
            name: commitment.name,
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
            linkedCostGuardAlertId: commitment.linkedCostGuardAlertId,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            updatedAt: new Date("2026-09-01T00:00:00.000Z"),
          })),
      },
    })

    await mock.module("@/lib/commitguard/detection", {
      namedExports: {
        listDetectedCommitmentCandidates: async () => [],
      },
    })

    await mock.module("@/lib/subscriptionPlans", {
      namedExports: {
        hasPlanFeature: (_tier: unknown, feature: string) => feature === "commitguard_core" || feature === "commitguard_detection",
      },
    })

    await mock.module("@/components/dashboard/commitguard/CommitGuardWorkspace", {
      namedExports: {
        CommitGuardWorkspace: () => ({ type: "mock-commitguard-workspace" }) as unknown,
      },
    })

    ;({ default: CostGuardDashboardPage } = await import("@/app/dashboard/cost-guard/page"))
    ;({ default: CommitGuardDashboardPage } = await import("@/app/dashboard/commitguard/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    costGuardAlerts = [
      {
        id: "alert-123",
        severity: "warning",
        title: "Cloud costs increased",
        description: "Spend rose materially month-over-month.",
        varianceAmountCents: 50_000,
        variancePercent: 35,
        alertType: "spike",
      },
    ]
    commitGuardCommitments = [
      { name: "Matched cloud plan", linkedCostGuardAlertId: "alert-123" },
      { name: "Unrelated insurance", linkedCostGuardAlertId: "alert-999" },
    ]
  })

  test("renders commitment-impact deep-link on Cost Guard alert cards", async () => {
    const element = await CostGuardDashboardPage()
    const text = collectText(element)
    const hrefs = collectHrefs(element)

    assert.match(text, /Commitment impact/)
    assert.match(text, /View details/)
    assert.ok(hrefs.includes("/dashboard/commitguard?costGuardAlertId=alert-123"))
  })

  test("applies costGuardAlertId filter when opening CommitGuard from Cost Guard deep-link", async () => {
    const element = await CommitGuardDashboardPage({
      searchParams: Promise.resolve({ costGuardAlertId: "alert-123" }),
    })

    const text = collectText(element)
    assert.ok(element)
    assert.match(text, /Filtered to commitments linked to Cost Guard alert\s+alert-123\s*\./)
    assert.match(text, /Matched cloud plan/)
    assert.doesNotMatch(text, /Unrelated insurance/)
  })
})