import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-1" }

interface MockFinding {
  id: string
  state: string
  summary: string
}

let finding: MockFinding | null = {
  id: "finding-1",
  state: "open",
  summary: "Duplicate spend candidate",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PATCH: any

describe("/api/spend-insights/[id]", () => {
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
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          const tx = {
            spendInsight: {
              findFirst: async () => {
                if (!finding) return null
                return {
                  id: finding.id,
                  findingType: "duplicate_payment",
                  summary: finding.summary,
                  severity: "high",
                  state: finding.state,
                  evidence: { source: "xero" },
                  detectedAt: new Date("2026-09-01T00:00:00.000Z"),
                  resolvedAt: finding.state === "resolved" ? new Date("2026-09-02T00:00:00.000Z") : null,
                }
              },
              update: async ({ data }: { data: { state: string } }) => {
                if (!finding) throw new Error("not found")
                finding = { ...finding, state: data.state }
                return {
                  id: finding.id,
                  state: finding.state,
                  resolvedAt: finding.state === "resolved" ? new Date("2026-09-02T00:00:00.000Z") : null,
                }
              },
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ GET, PATCH } = await import("@/app/api/spend-insights/[id]/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    finding = { id: "finding-1", state: "open", summary: "Duplicate spend candidate" }
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const res = await GET(new Request("http://localhost/api/spend-insights/finding-1"), {
      params: Promise.resolve({ id: "finding-1" }),
    })
    assert.equal(res.status, 401)
  })

  test("returns 404 when finding is unavailable", async () => {
    finding = null
    const res = await GET(new Request("http://localhost/api/spend-insights/missing"), {
      params: Promise.resolve({ id: "missing" }),
    })
    assert.equal(res.status, 404)
  })

  test("updates state on valid lifecycle action", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/spend-insights/finding-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      }),
      { params: Promise.resolve({ id: "finding-1" }) },
    )

    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.finding.state, "resolved")
  })

  test("rejects invalid transition", async () => {
    finding = { id: "finding-1", state: "resolved", summary: "Done" }
    const res = await PATCH(
      new Request("http://localhost/api/spend-insights/finding-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      }),
      { params: Promise.resolve({ id: "finding-1" }) },
    )

    assert.equal(res.status, 422)
  })
})
