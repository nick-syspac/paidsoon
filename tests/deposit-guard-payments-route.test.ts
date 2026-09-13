import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user_1" }
let shouldThrowUpgrade = false
let shouldThrowValidation = false

describe("DepositGuard payments route", () => {
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

    await mock.module("@/lib/depositGuard/service", {
      exports: {
        recordManualDepositPayment: async () => {
          if (shouldThrowUpgrade) throw new Error("Upgrade required")
          if (shouldThrowValidation) throw new Error("DepositGuard job not found")
          return {
            payment: {
              id: "pay_1",
              status: "confirmed",
              amountCents: 10000,
              currency: "aud",
              paidAt: new Date("2026-09-12T00:00:00.000Z"),
            },
            idempotentReplay: false,
          }
        },
      },
    })
  })

  beforeEach(() => {
    mockUser = { id: "user_1" }
    shouldThrowUpgrade = false
    shouldThrowValidation = false
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const { POST } = await import("@/app/api/deposit-guard/payments/route")

    const response = await POST(
      new Request("http://localhost/api/deposit-guard/payments", {
        method: "POST",
        body: "{}",
      }),
    )

    const body = await response.json()
    assert.equal(response.status, 401)
    assert.deepEqual(body, { error: "Unauthorized" })
  })

  test("returns 403 for upgrade-required response", async () => {
    shouldThrowUpgrade = true
    const { POST } = await import("@/app/api/deposit-guard/payments/route")

    const response = await POST(
      new Request("http://localhost/api/deposit-guard/payments", {
        method: "POST",
        body: JSON.stringify({
          jobId: "job_1",
          amountCents: 10000,
          currency: "AUD",
          paymentMethod: "bank_transfer",
          idempotencyKey: "manual-1",
        }),
        headers: { "content-type": "application/json" },
      }),
    )

    const body = await response.json()
    assert.equal(response.status, 403)
    assert.deepEqual(body, { error: "Upgrade required" })
  })

  test("records manual payment and returns 201", async () => {
    const { POST } = await import("@/app/api/deposit-guard/payments/route")

    const response = await POST(
      new Request("http://localhost/api/deposit-guard/payments", {
        method: "POST",
        body: JSON.stringify({
          jobId: "job_1",
          amountCents: 10000,
          currency: "AUD",
          paymentMethod: "bank_transfer",
          idempotencyKey: "manual-1",
        }),
        headers: { "content-type": "application/json" },
      }),
    )

    const body = await response.json()
    assert.equal(response.status, 201)
    assert.equal(body.payment.id, "pay_1")
    assert.equal(body.idempotentReplay, false)
  })
})
