import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
let redirectedTo: string | null = null
let lastLookupUserId: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SpendLeakFindingPage: any

function findElementByType(node: unknown, typeName: string): { props?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") return null

  const element = node as { type?: unknown; props?: { children?: unknown } }
  if (typeof element.type === "function" && element.type.name === typeName) {
    return element as { props?: Record<string, unknown> }
  }

  const children = element.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const match = findElementByType(child, typeName)
      if (match) return match
    }
  } else if (children !== undefined) {
    const match = findElementByType(children, typeName)
    if (match) return match
  }

  return null
}

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

describe("SpendLeak finding detail page", () => {
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

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (userId: string, callback: (tx: {
          spendInsight: { findFirst: (args: { where: { id: string; userId: string } }) => Promise<unknown> }
        }) => Promise<unknown>) => {
          lastLookupUserId = userId
          const finding =
            userId === "user-1"
              ? {
                  id: "finding-1",
                  userId: "user-1",
                  accountingConnectionId: null,
                  findingType: "duplicate_payment",
                  subjectKey: "sub-1",
                  severity: "high",
                  summary: "Possible duplicate",
                  state: "open",
                  reviewAction: "cancel",
                  reviewActionAt: new Date("2026-09-02T00:00:00.000Z"),
                  reviewActionBy: "user-1",
                  reviewNote: "Cancelled duplicate service",
                  estimatedMonthlyCents: 420000,
                  estimatedAnnualCents: 5040000,
                  evidence: {
                    source: "expense_import",
                    supplier: "metro saas systems",
                    billIds: ["coast-bill-metro-jan", "coast-bill-metro-feb"],
                    dayDifference: 30,
                    amountCents: 420000,
                  },
                  detectedAt: new Date("2026-09-01T00:00:00.000Z"),
                  resolvedAt: null,
                  createdAt: new Date("2026-09-01T00:00:00.000Z"),
                  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
                }
              : null

          return callback({
            spendInsight: {
              findFirst: async ({ where }) => {
                lastLookupUserId = where.userId
                if (finding && where.userId === finding.userId && where.id === finding.id) {
                  return finding
                }
                return null
              },
            },
          })
        },
      },
    })

    await mock.module("@/components/dashboard/spendleak/FindingActionButtons", {
      namedExports: {
        FindingActionButtons: function FindingActionButtons() {
          return { type: "mock-finding-actions" } as unknown
        },
      },
    })

    await mock.module("@/components/dashboard/spendleak/SpendLeakEvidenceDetails", {
      namedExports: {
        SpendLeakEvidenceDetails: function SpendLeakEvidenceDetails() {
          return { type: "mock-evidence-details" } as unknown
        },
      },
    })

    ;({ default: SpendLeakFindingPage } = await import("@/app/dashboard/spendleak/[id]/page"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    redirectedTo = null
    lastLookupUserId = null
  })

  test("redirects unauthenticated users to sign-in", async () => {
    mockUser = null
    const result = await SpendLeakFindingPage({ params: Promise.resolve({ id: "finding-1" }) }).catch((err: unknown) => err)
    assert.equal(result instanceof Error, true)
    if (result instanceof Error) assert.equal(result.message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/sign-in")
  })

  test("renders structured evidence and lifecycle controls for owned findings", async () => {
    const element = await SpendLeakFindingPage({ params: Promise.resolve({ id: "finding-1" }) })

    assert.ok(element)
    assert.equal(lastLookupUserId, "user-1")

    const actionButtons = findElementByType(element, "FindingActionButtons")
    const evidenceDetails = findElementByType(element, "SpendLeakEvidenceDetails")
    const actionProps = actionButtons?.props as { initialState?: string } | undefined
    const evidenceProps = evidenceDetails?.props as { finding?: { findingType: string; evidence: unknown } } | undefined

    assert.ok(actionButtons)
    assert.equal(actionProps?.initialState, "open")
    assert.ok(evidenceDetails)
    assert.equal(evidenceProps?.finding?.findingType, "duplicate_payment")
    assert.deepEqual(evidenceProps?.finding?.evidence, {
      source: "expense_import",
      supplier: "metro saas systems",
      billIds: ["coast-bill-metro-jan", "coast-bill-metro-feb"],
      dayDifference: 30,
      amountCents: 420000,
    })
    assert.match(collectText(element), /Decision:\s*cancel/)
    assert.match(collectText(element), /Cancelled duplicate service/)
  })

  test("does not reveal another tenant's finding", async () => {
    mockUser = { id: "user-2" }
    const element = await SpendLeakFindingPage({ params: Promise.resolve({ id: "finding-1" }) })

    assert.ok(element)
    assert.equal(lastLookupUserId, "user-2")
    assert.equal(findElementByType(element, "SpendLeakEvidenceDetails"), null)
    assert.match(collectText(element), /Finding unavailable/)
  })
})
