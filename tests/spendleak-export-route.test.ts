import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

import type { SpendInsight } from "@/lib/generated/prisma/client"

let mockUser: { id: string } | null = { id: "user-123" }
let mockSubscriptionTier = "small_business"
let mockFindings: SpendInsight[] = []

let GET: (request: Request) => Promise<Response>

function makeFinding(
  overrides: Partial<SpendInsight> & { id: string; findingType: string; userId?: string },
): SpendInsight {
  return {
    id: overrides.id,
    userId: overrides.userId ?? "user-123",
    accountingConnectionId: null,
    findingType: overrides.findingType,
    subjectKey: "Acme",
    severity: "medium",
    summary: "summary",
    state: "open",
    reviewAction: null,
    reviewActionAt: null,
    reviewActionBy: null,
    reviewNote: null,
    evidenceFingerprint: null,
    estimatedMonthlyCents: 3000,
    estimatedAnnualCents: 36000,
    evidence: { supplier: "Acme", source: "expense_import" },
    detectedAt: new Date("2026-09-01T00:00:00.000Z"),
    resolvedAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("GET /api/spendleak/export", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (userId: string, fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            userProfile: {
              findUnique: async () => ({ subscriptionTier: mockSubscriptionTier }),
            },
            spendInsight: {
              findMany: async (args: { where?: { userId?: string } }) => {
                const scopedUserId = args.where?.userId ?? userId
                return mockFindings.filter((finding) => finding.userId === scopedUserId)
              },
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ GET } = await import("@/app/api/spendleak/export/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockSubscriptionTier = "small_business"
    mockFindings = [
      makeFinding({ id: "1", findingType: "recurring_spend" }),
      makeFinding({ id: "2", findingType: "duplicate_spend" }),
      makeFinding({ id: "3", findingType: "renewal" }),
      makeFinding({ id: "4", findingType: "recurring_spend", userId: "another-tenant" }),
    ]
  })

  function makeRequest(query: string): Request {
    return new Request(`http://localhost/api/spendleak/export?${query}`)
  }

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const response = await GET(makeRequest("format=csv"))
    assert.equal(response.status, 401)
  })

  test("returns 400 for invalid format", async () => {
    const response = await GET(makeRequest("format=pdf"))
    assert.equal(response.status, 400)
  })

  test("returns 400 for invalid module", async () => {
    const response = await GET(makeRequest("format=csv&module=unknown"))
    assert.equal(response.status, 400)
  })

  test("returns 403 when plan lacks csv_export", async () => {
    mockSubscriptionTier = "solo"
    const response = await GET(makeRequest("format=csv"))
    assert.equal(response.status, 403)
  })

  test("returns CSV and excludes cross-tenant findings", async () => {
    const response = await GET(makeRequest("format=csv"))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8")
    assert.equal(response.headers.get("X-PaidSoon-SpendLeak-Export-Row-Count"), "3")

    const body = await response.text()
    assert.match(body, /recurring_spend/)
    assert.match(body, /duplicate_spend/)
    assert.match(body, /renewal/)
    assert.doesNotMatch(body, /another-tenant/)
  })

  test("applies module filter from dashboard scope", async () => {
    const response = await GET(makeRequest("format=csv&module=duplicate_spend"))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("X-PaidSoon-SpendLeak-Export-Row-Count"), "1")

    const body = await response.text()
    assert.match(body, /duplicate_spend/)
    assert.doesNotMatch(body, /recurring_spend/)
    assert.doesNotMatch(body, /renewal/)
  })

  test("returns XLSX with expected content type and filename", async () => {
    const response = await GET(makeRequest("format=xlsx"))
    assert.equal(response.status, 200)
    assert.equal(
      response.headers.get("Content-Type"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    assert.match(
      response.headers.get("Content-Disposition") ?? "",
      /paidsoon-spendleak-report-\d{4}-\d{2}-\d{2}\.xlsx/,
    )
  })
})
