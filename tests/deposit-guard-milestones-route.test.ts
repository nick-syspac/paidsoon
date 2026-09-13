import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user_1" }
let listResult: unknown[] = []
let createResult: unknown = { id: "mil_1" }
let updateResult: unknown = null
let deleteResult = false
let generateResult: unknown = null

describe("DepositGuard milestone routes", () => {
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

    await mock.module("@/lib/depositGuard/milestones", {
      exports: {
        listDepositGuardMilestones: async () => listResult,
        createDepositGuardMilestone: async () => createResult,
        updateDepositGuardMilestone: async () => updateResult,
        deleteDepositGuardMilestone: async () => deleteResult,
        generateDepositRequestFromMilestone: async () => generateResult,
      },
    })
  })

  beforeEach(() => {
    mockUser = { id: "user_1" }
    listResult = []
    createResult = { id: "mil_1" }
    updateResult = null
    deleteResult = false
    generateResult = null
  })

  test("GET /api/deposit-guard/milestones returns 401 when unauthenticated", async () => {
    mockUser = null
    const { GET } = await import("@/app/api/deposit-guard/milestones/route")
    const response = await GET(new Request("http://localhost/api/deposit-guard/milestones"))
    const body = await response.json()

    assert.equal(response.status, 401)
    assert.deepEqual(body, { error: "Unauthorized" })
  })

  test("POST /api/deposit-guard/milestones validates payload", async () => {
    const { POST } = await import("@/app/api/deposit-guard/milestones/route")
    const response = await POST(
      new Request("http://localhost/api/deposit-guard/milestones", {
        method: "POST",
        body: JSON.stringify({ jobId: "job_1" }),
        headers: { "content-type": "application/json" },
      }),
    )

    assert.equal(response.status, 400)
  })

  test("PATCH /api/deposit-guard/milestones/[milestoneId] returns 404 when missing", async () => {
    updateResult = null
    const { PATCH } = await import("@/app/api/deposit-guard/milestones/[milestoneId]/route")

    const response = await PATCH(
      new Request("http://localhost/api/deposit-guard/milestones/m1", {
        method: "PATCH",
        body: JSON.stringify({ name: "New" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ milestoneId: "m1" }) },
    )

    assert.equal(response.status, 404)
  })

  test("POST /api/deposit-guard/milestones/[milestoneId]/generate-request returns 201 when created", async () => {
    generateResult = {
      milestone: { id: "m1" },
      requestId: "req_1",
    }

    const { POST } = await import(
      "@/app/api/deposit-guard/milestones/[milestoneId]/generate-request/route"
    )

    const response = await POST(
      new Request("http://localhost/api/deposit-guard/milestones/m1/generate-request", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ milestoneId: "m1" }) },
    )

    const body = await response.json()
    assert.equal(response.status, 201)
    assert.equal(body.requestId, "req_1")
  })
})
