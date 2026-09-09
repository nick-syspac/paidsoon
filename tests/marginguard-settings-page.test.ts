import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let mockCanAccess = true
let redirectedTo: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MarginGuardSettingsPage: any

function findNodeWithSettingsProps(node: unknown): { props?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null
  const element = node as { props?: { children?: unknown; initialSettings?: unknown } }

  if (element.props && "initialSettings" in element.props) {
    return element
  }

  const children = element.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const match = findNodeWithSettingsProps(child)
      if (match) return match
    }
  } else if (children !== undefined) {
    return findNodeWithSettingsProps(children)
  }

  return null
}

describe("MarginGuard settings page", () => {
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
        getOrCreateMarginSettings: async () => ({
          enabled: true,
          defaultPeriod: "30d",
          targetGrossMarginPercent: 45,
          warningGrossMarginPercent: 35,
          criticalGrossMarginPercent: 25,
          minCompletenessPercent: 70,
          alertBelowWarning: true,
          alertBelowCritical: true,
          alertDeterioration: true,
          alertNegativeMargin: true,
          alertCustomerMarginWarning: true,
          alertCostIncrease: true,
          alertDataQualityWarning: true,
          alertDigestMode: "daily",
        }),
        listMarginTargets: async () => [
          {
            id: "target-1",
            scopeType: "organization",
            scopeKey: null,
            targetGrossMarginPercent: 45,
            warningGrossMarginPercent: 35,
            criticalGrossMarginPercent: 25,
            isActive: true,
          },
        ],
        listMarginRules: async () => [
          {
            id: "rule-1",
            name: "Default supplier rule",
            ruleType: "supplier",
            classification: "DIRECT_COST",
            priority: 100,
            enabled: true,
          },
        ],
        listMarginClassifications: async () => [
          {
            id: "class-1",
            sourceType: "imported_bill",
            sourceRecordId: "bill-1",
            classification: "DIRECT_COST",
            classificationOrigin: "rule",
            updatedAt: new Date("2026-09-08T00:00:00.000Z"),
          },
        ],
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: {
          accountingConnection: {
            findMany: () => Promise<Array<{
              id: string
              provider: string
              organisationName: string
              status: string
              lastSyncedAt: Date | null
            }>>
          }
          financialInvoice: { count: () => Promise<number> }
          importedBill: { count: () => Promise<number> }
          importedBankTransaction: { count: () => Promise<number> }
        }) => Promise<unknown>) =>
          fn({
            accountingConnection: {
              findMany: async () => [
                {
                  id: "conn-1",
                  provider: "xero",
                  organisationName: "Acme Pty Ltd",
                  status: "active",
                  lastSyncedAt: new Date("2026-09-08T00:00:00.000Z"),
                },
              ],
            },
            financialInvoice: { count: async () => 12 },
            importedBill: { count: async () => 7 },
            importedBankTransaction: { count: async () => 19 },
          }),
      },
    })

    await mock.module("@/components/settings/MarginGuardSettingsClient", {
      namedExports: {
        MarginGuardSettingsClient: ({ initialSettings, initialTargets, initialRules, initialClassifications, sources }: {
          initialSettings: { targetGrossMarginPercent: number; alertDigestMode: string }
          initialTargets: unknown[]
          initialRules: unknown[]
          initialClassifications: unknown[]
          sources: unknown[]
        }) =>
          ({
            type: "mock-margin-settings-client",
            props: {
              initialSettings,
              initialTargets,
              initialRules,
              initialClassifications,
              sources,
            },
          }) as unknown,
      },
    })

    ;({ default: MarginGuardSettingsPage } = await import("@/app/dashboard/settings/margin-guard/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockCanAccess = true
    redirectedTo = null
  })

  test("redirects to sign-in when unauthenticated", async () => {
    mockUser = null
    const result = await MarginGuardSettingsPage().catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/sign-in")
  })

  test("redirects to dashboard intent when feature is unavailable", async () => {
    mockCanAccess = false
    const result = await MarginGuardSettingsPage().catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/dashboard?intent=marginguard")
  })

  test("passes mapped settings, targets, and source status to client component", async () => {
    const element = await MarginGuardSettingsPage()
    const client = findNodeWithSettingsProps(element)

    assert.equal(Boolean(client?.props?.initialSettings && typeof client.props.initialSettings === "object"), true)
    assert.equal((client?.props?.initialSettings as { targetGrossMarginPercent: number; alertDigestMode: string } | undefined)?.targetGrossMarginPercent, 45)
    assert.equal((client?.props?.initialSettings as { targetGrossMarginPercent: number; alertDigestMode: string } | undefined)?.alertDigestMode, "daily")
    assert.equal(Array.isArray(client?.props?.initialTargets), true)
    assert.equal(Array.isArray(client?.props?.initialRules), true)
    assert.equal(Array.isArray(client?.props?.initialClassifications), true)
    assert.equal(Array.isArray(client?.props?.sources), true)
    assert.equal((client?.props?.sources as unknown[] | undefined)?.length, 4)
  })
})
