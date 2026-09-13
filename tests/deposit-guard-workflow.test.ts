import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user_1" }
let previewOnlyMode = false

interface JobRow {
  id: string
  name: string
  currency: string
  workStatus: string
  paymentStatus: string
  commencementBlocked: boolean
  outstandingAmountCents: number
}

interface RequestRow {
  id: string
  jobId: string
  status: string
  amountCents: number
  totalAmountCents: number
  currency: string
  dueDate: Date
  updatedAt: Date
}

const jobs: JobRow[] = []
const requests: RequestRow[] = []
const sentRequestIds = new Set<string>()

class MockDepositGuardAccessError extends Error {
  constructor(
    public readonly code: "upgrade_required" | "preview_only" | "active_job_limit_reached",
    message: string,
  ) {
    super(message)
  }
}

describe("DepositGuard end-to-end workflow", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/depositGuard/jobs", {
      namedExports: {
        DepositGuardAccessError: MockDepositGuardAccessError,
        listDepositGuardJobs: async () => jobs,
        createDepositGuardJob: async (_userId: string, input: { name: string; currency: string }) => {
          if (previewOnlyMode) {
            throw new MockDepositGuardAccessError(
              "preview_only",
              "Preview mode only. Upgrade required for DepositGuard operations.",
            )
          }

          const row: JobRow = {
            id: `job_${jobs.length + 1}`,
            name: input.name,
            currency: input.currency,
            workStatus: "awaiting_deposit",
            paymentStatus: "requested",
            commencementBlocked: true,
            outstandingAmountCents: 132_000,
          }
          jobs.push(row)
          return row
        },
      },
    })

    await mock.module("@/lib/depositGuard/requests", {
      namedExports: {
        toRequestAccessError: (error: unknown) =>
          error instanceof Error && error.message === "Upgrade required"
            ? { code: "upgrade_required" }
            : null,
        listDepositRequests: async () => requests,
        createDepositRequest: async (
          _userId: string,
          input: {
            jobId: string
            amountCents: number
            totalAmountCents: number
            currency: string
            dueDate: Date
          },
        ) => {
          const row: RequestRow = {
            id: `req_${requests.length + 1}`,
            jobId: input.jobId,
            status: "requested",
            amountCents: input.amountCents,
            totalAmountCents: input.totalAmountCents,
            currency: input.currency,
            dueDate: input.dueDate,
            updatedAt: new Date("2026-09-13T00:00:00.000Z"),
          }
          requests.push(row)
          return row
        },
        sendDepositRequest: async (_userId: string, requestId: string) => {
          const row = requests.find((request) => request.id === requestId) ?? null
          if (!row) return null
          row.status = "requested"
          row.updatedAt = new Date("2026-09-13T00:10:00.000Z")
          sentRequestIds.add(requestId)
          return row
        },
        resendDepositRequest: async () => null,
        cancelDepositRequest: async () => null,
        updateDepositRequestDueDate: async () => null,
      },
    })

    await mock.module("@/lib/depositGuard/service", {
      namedExports: {
        recordManualDepositPayment: async (_userId: string, input: { requestId?: string | null; amountCents: number }) => {
          const row = input.requestId ? requests.find((request) => request.id === input.requestId) : null
          if (!row) {
            throw new Error("Deposit request not found")
          }

          row.status = input.amountCents >= row.totalAmountCents ? "paid" : "partially_paid"
          row.updatedAt = new Date("2026-09-13T00:30:00.000Z")

          return {
            payment: {
              id: "pay_1",
              status: "confirmed",
              amountCents: input.amountCents,
              currency: row.currency,
              paidAt: new Date("2026-09-13T00:30:00.000Z"),
            },
            idempotentReplay: false,
          }
        },
      },
    })
  })

  beforeEach(() => {
    mockUser = { id: "user_1" }
    previewOnlyMode = false
    jobs.length = 0
    requests.length = 0
    sentRequestIds.clear()
  })

  test("runs MVP API workflow from job creation to paid deposit", async () => {
    const { POST: createJob } = await import("@/app/api/deposit-guard/jobs/route")
    const { POST: createRequest } = await import("@/app/api/deposit-guard/requests/route")
    const { POST: requestAction } = await import("@/app/api/deposit-guard/requests/[requestId]/route")
    const { POST: recordPayment } = await import("@/app/api/deposit-guard/payments/route")

    const jobResponse = await createJob(
      new Request("http://localhost/api/deposit-guard/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Kitchen renovation",
          currency: "AUD",
          sourceAmountCents: 120_000,
          taxAmountCents: 12_000,
          sourceTaxMode: "exclusive",
          depositType: "percentage",
          depositPercentage: 50,
        }),
      }),
    )
    const createdJob = await jobResponse.json()

    assert.equal(jobResponse.status, 201)
    assert.equal(createdJob.job.id, "job_1")

    const requestResponse = await createRequest(
      new Request("http://localhost/api/deposit-guard/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "job_1",
          requestType: "deposit",
          amountCents: 66_000,
          taxAmountCents: 0,
          totalAmountCents: 66_000,
          currency: "AUD",
          dueDate: "2026-10-01T00:00:00.000Z",
        }),
      }),
    )
    const createdRequest = await requestResponse.json()

    assert.equal(requestResponse.status, 201)
    assert.equal(createdRequest.request.id, "req_1")

    const sendResponse = await requestAction(
      new Request("http://localhost/api/deposit-guard/requests/req_1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      }),
      { params: Promise.resolve({ requestId: "req_1" }) },
    )

    assert.equal(sendResponse.status, 200)
    assert.equal(sentRequestIds.has("req_1"), true)

    const paymentResponse = await recordPayment(
      new Request("http://localhost/api/deposit-guard/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "job_1",
          requestId: "req_1",
          amountCents: 66_000,
          currency: "AUD",
          paymentMethod: "bank_transfer",
          idempotencyKey: "workflow-pay-1",
        }),
      }),
    )
    const paymentBody = await paymentResponse.json()

    assert.equal(paymentResponse.status, 201)
    assert.equal(paymentBody.payment.status, "confirmed")
    assert.equal(requests[0]?.status, "paid")
  })

  test("returns deterministic preview-only response for non-entitled create flow", async () => {
    previewOnlyMode = true
    const { POST: createJob } = await import("@/app/api/deposit-guard/jobs/route")

    const response = await createJob(
      new Request("http://localhost/api/deposit-guard/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Preview-only workflow",
          currency: "AUD",
          sourceAmountCents: 80_000,
          sourceTaxMode: "inclusive",
          depositType: "percentage",
          depositPercentage: 25,
        }),
      }),
    )
    const body = await response.json()

    assert.equal(response.status, 403)
    assert.equal(body.error, "Upgrade required")
    assert.equal(body.code, "preview_only")
    assert.equal(body.previewMode, true)
  })
})
