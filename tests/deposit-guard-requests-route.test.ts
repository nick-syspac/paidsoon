import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user_1" }
let listResult: unknown[] = []
let createResult: unknown = { id: "req_1" }
let actionResult: unknown = null
let dueDateResult: unknown = null
let paymentLinkResult: {
  requestId: string
  token: string
  url: string
  expiresAt: Date
} | null = null

describe("DepositGuard request routes", () => {
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

    await mock.module("@/lib/depositGuard/requests", {
      exports: {
        listDepositRequests: async () => listResult,
        createDepositRequest: async () => createResult,
        sendDepositRequest: async () => actionResult,
        resendDepositRequest: async () => actionResult,
        cancelDepositRequest: async () => actionResult,
        updateDepositRequestDueDate: async () => dueDateResult,
        issueDepositRequestPublicLink: async () => paymentLinkResult,
        toRequestAccessError: (error: unknown) => {
          if (error instanceof Error && error.message === "Upgrade required") {
            return { code: "upgrade_required" }
          }
          return null
        },
      },
    })
  })

  beforeEach(async () => {
    mockUser = { id: "user_1" }
    listResult = []
    createResult = { id: "req_1" }
    actionResult = null
    dueDateResult = null
    paymentLinkResult = {
      requestId: "req_1",
      token: "tok_1",
      url: "https://example.test/pay/deposit/tok_1",
      expiresAt: new Date("2026-10-12T00:00:00.000Z"),
    }
  })

  test("GET /api/deposit-guard/requests returns 401 when unauthenticated", async () => {
    mockUser = null
    const { GET } = await import("@/app/api/deposit-guard/requests/route")
    const response = await GET(new Request("http://localhost/api/deposit-guard/requests"))
    const body = await response.json()

    assert.equal(response.status, 401)
    assert.deepEqual(body, { error: "Unauthorized" })
  })

  test("POST /api/deposit-guard/requests rejects invalid payload", async () => {
    const { POST } = await import("@/app/api/deposit-guard/requests/route")
    const response = await POST(
      new Request("http://localhost/api/deposit-guard/requests", {
        method: "POST",
        body: JSON.stringify({
          jobId: "job_1",
          requestType: "deposit",
        }),
        headers: { "content-type": "application/json" },
      }),
    )

    assert.equal(response.status, 400)
  })

  test("POST /api/deposit-guard/requests/[requestId] returns 404 when action target missing", async () => {
    const { POST } = await import("@/app/api/deposit-guard/requests/[requestId]/route")

    const response = await POST(
      new Request("http://localhost/api/deposit-guard/requests/req_404", {
        method: "POST",
        body: JSON.stringify({ action: "send" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ requestId: "req_404" }) },
    )

    const body = await response.json()
    assert.equal(response.status, 404)
    assert.deepEqual(body, { error: "Not found" })
  })

  test("POST /api/deposit-guard/requests/[requestId]/payment-link returns generated link", async () => {
    const { POST } = await import(
      "@/app/api/deposit-guard/requests/[requestId]/payment-link/route"
    )

    const response = await POST(
      new Request("http://localhost/api/deposit-guard/requests/req_1/payment-link", {
        method: "POST",
      }),
      { params: Promise.resolve({ requestId: "req_1" }) },
    )

    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.requestId, "req_1")
    assert.equal(body.publicUrl, "https://example.test/pay/deposit/tok_1")
    assert.equal(body.token, "tok_1")
  })
})
