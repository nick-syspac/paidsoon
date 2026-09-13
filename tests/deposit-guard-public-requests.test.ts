import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { before, beforeEach, describe, mock, test } from "node:test"

const viewEvents: Array<{ userId: string; depositRequestId?: string | null }> = []
let requestRow: {
  id: string
  jobId: string
  status: string
  amountCents: number
  taxAmountCents: number | null
  totalAmountCents: number
  currency: string
  dueDate: Date
  description: string | null
  externalPaymentUrl: string | null
  firstViewedAt: Date | null
  lastViewedAt: Date | null
  paidAt: Date | null
  cancelledAt: Date | null
  tokenExpiresAt: Date | null
  job: { userId: string }
} | null = null

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

describe("DepositGuard public request helper", () => {
  before(async () => {
    // @ts-expect-error node:test mock typings are narrower than the runtime module map used here
    await mock.module("@/lib/db/admin", {
      exports: {
        prismaAdmin: {
          depositRequest: {
            findUnique: async ({ where }: { where: { publicTokenHash: string } }) => {
              if (!requestRow || where.publicTokenHash !== tokenHash("valid-token")) {
                return null
              }
              return requestRow
            },
            update: async ({ data }: { data: { firstViewedAt?: Date; lastViewedAt?: Date; status?: string } }) => {
              if (!requestRow) throw new Error("missing request")
              requestRow = {
                ...requestRow,
                ...data,
                status: data.status ?? requestRow.status,
                firstViewedAt: data.firstViewedAt ?? requestRow.firstViewedAt,
                lastViewedAt: data.lastViewedAt ?? requestRow.lastViewedAt,
              }
              return requestRow
            },
          },
          depositGuardEvent: {
            create: async ({ data }: { data: { userId: string; depositRequestId?: string | null } }) => {
              viewEvents.push({ userId: data.userId, depositRequestId: data.depositRequestId ?? null })
              return data
            },
          },
          $transaction: async <T>(callback: (tx: {
            depositRequest: {
              findUnique: typeof mock extends never ? never : unknown
              update: typeof mock extends never ? never : unknown
            }
            depositGuardEvent: { create: typeof mock extends never ? never : unknown }
          }) => Promise<T>) => callback({
            depositRequest: {
              findUnique: async ({ where }: { where: { publicTokenHash: string } }) => {
                if (!requestRow || where.publicTokenHash !== tokenHash("valid-token")) {
                  return null
                }
                return requestRow
              },
              update: async ({ data }: { data: { firstViewedAt?: Date; lastViewedAt?: Date; status?: string } }) => {
                if (!requestRow) throw new Error("missing request")
                requestRow = {
                  ...requestRow,
                  ...data,
                  status: data.status ?? requestRow.status,
                  firstViewedAt: data.firstViewedAt ?? requestRow.firstViewedAt,
                  lastViewedAt: data.lastViewedAt ?? requestRow.lastViewedAt,
                }
                return requestRow
              },
            },
            depositGuardEvent: {
              create: async ({ data }: { data: { userId: string; depositRequestId?: string | null } }) => {
                viewEvents.push({ userId: data.userId, depositRequestId: data.depositRequestId ?? null })
                return data
              },
            },
          }),
        },
      },
    } as never)
  })

  beforeEach(() => {
    viewEvents.length = 0
    requestRow = {
      id: "req_1",
      jobId: "job_1",
      status: "requested",
      amountCents: 15000,
      taxAmountCents: 1500,
      totalAmountCents: 16500,
      currency: "aud",
      dueDate: new Date("2026-10-01T00:00:00.000Z"),
      description: "Progress deposit",
      externalPaymentUrl: "https://pay.example.test/request/1",
      firstViewedAt: null,
      lastViewedAt: null,
      paidAt: null,
      cancelledAt: null,
      tokenExpiresAt: new Date("2026-10-12T00:00:00.000Z"),
      job: { userId: "user_1" },
    }
  })

  test("throttles repeated lookups for the same client fingerprint", async () => {
    const {
      getPublicDepositRequestView,
      resetPublicDepositRequestLookupThrottleForTests,
    } = await import("@/lib/depositGuard/publicRequests")

    viewEvents.length = 0
    resetPublicDepositRequestLookupThrottleForTests()

    for (let index = 0; index < 8; index += 1) {
      const result = await getPublicDepositRequestView("valid-token", { clientFingerprint: "client-a" })
      assert.equal(result.state, "active")
    }

    const limited = await getPublicDepositRequestView("valid-token", { clientFingerprint: "client-a" })

    assert.equal(limited.state, "unavailable")
  })

  test("records first view once and keeps later views idempotent", async () => {
    const {
      getPublicDepositRequestView,
      resetPublicDepositRequestLookupThrottleForTests,
    } = await import("@/lib/depositGuard/publicRequests")

    resetPublicDepositRequestLookupThrottleForTests()

    const first = await getPublicDepositRequestView("valid-token", { clientFingerprint: "client-b" })
    const second = await getPublicDepositRequestView("valid-token", { clientFingerprint: "client-b" })

    assert.equal(first.state, "active")
    assert.ok(first.firstViewedAt)
    assert.ok(first.lastViewedAt)
    assert.equal(second.state, "active")
    assert.ok(second.firstViewedAt)
    assert.ok(second.lastViewedAt)
    assert.equal(viewEvents.length, 1)
    assert.equal(viewEvents[0]?.userId, "user_1")
  })

  test("returns unavailable for unknown tokens", async () => {
    const { getPublicDepositRequestView, resetPublicDepositRequestLookupThrottleForTests } = await import(
      "@/lib/depositGuard/publicRequests",
    )

    resetPublicDepositRequestLookupThrottleForTests()

    const result = await getPublicDepositRequestView("missing-token", { clientFingerprint: "client-c" })

    assert.equal(result.state, "unavailable")
  })
})
