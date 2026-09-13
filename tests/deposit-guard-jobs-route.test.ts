import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user_1" }
let listResult: unknown[] = []
let createShouldThrowPreview = false
let updateResult: unknown = null
let archiveResult: unknown = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let jobsRoute: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let jobIdRoute: any

class MockDepositGuardAccessError extends Error {
  constructor(public readonly code: "upgrade_required" | "preview_only" | "active_job_limit_reached", message: string) {
    super(message)
  }
}

describe("DepositGuard jobs routes", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      exports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/depositGuard/jobs", {
      exports: {
        DepositGuardAccessError: MockDepositGuardAccessError,
        listDepositGuardJobs: async () => listResult,
        createDepositGuardJob: async () => {
          if (createShouldThrowPreview) {
            throw new MockDepositGuardAccessError(
              "preview_only",
              "Preview mode only. Upgrade required for DepositGuard operations.",
            )
          }
          return { id: "job_1" }
        },
        updateDepositGuardJob: async () => updateResult,
        archiveDepositGuardJob: async () => archiveResult,
      },
    })

    jobsRoute = await import("@/app/api/deposit-guard/jobs/route")
    jobIdRoute = await import("@/app/api/deposit-guard/jobs/[jobId]/route")
  })

  beforeEach(() => {
    mockUser = { id: "user_1" }
    listResult = []
    createShouldThrowPreview = false
    updateResult = null
    archiveResult = null
  })

  test("GET /api/deposit-guard/jobs returns 401 when unauthenticated", async () => {
    mockUser = null
    const response = await jobsRoute.GET(new Request("http://localhost/api/deposit-guard/jobs"))
    const body = await response.json()

    assert.equal(response.status, 401)
    assert.deepEqual(body, { error: "Unauthorized" })
  })

  test("POST /api/deposit-guard/jobs returns deterministic preview-only response", async () => {
    createShouldThrowPreview = true

    const response = await jobsRoute.POST(
      new Request("http://localhost/api/deposit-guard/jobs", {
        method: "POST",
        body: JSON.stringify({
          name: "Website build",
          currency: "AUD",
          sourceAmountCents: 100_000,
          sourceTaxMode: "inclusive",
          depositType: "percentage",
          depositPercentage: 30,
        }),
        headers: { "content-type": "application/json" },
      }),
    )
    const body = await response.json()

    assert.equal(response.status, 403)
    assert.equal(body.error, "Upgrade required")
    assert.equal(body.code, "preview_only")
    assert.equal(body.previewMode, true)
  })

  test("PATCH /api/deposit-guard/jobs/[jobId] returns 404 when job is missing", async () => {
    updateResult = null

    const response = await jobIdRoute.PATCH(
      new Request("http://localhost/api/deposit-guard/jobs/job_404", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ jobId: "job_404" }) },
    )

    const body = await response.json()
    assert.equal(response.status, 404)
    assert.deepEqual(body, { error: "Not found" })
  })
})
