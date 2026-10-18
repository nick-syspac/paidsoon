import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let reminderRow: {
  id: string
  userId: string
  reminderType: string
  scheduledFor: Date
  deliveryStatus: string
  providerMessageId: string | null
  failureReason: string | null
  depositRequest: {
    id: string
    jobId: string
    status: string
    description: string | null
    amountCents: number
    totalAmountCents: number
    currency: string
    dueDate: Date
    externalPaymentUrl: string | null
    job: {
      userProfile: { displayName: string | null }
      customer: {
        financialContact: { name: string | null; email: string | null }
      } | null
    }
  }
} | null = null
let sentMessages: Array<{ to: string; subject: string }> = []
const auditEvents: Array<{ eventType: string }> = []
let accessChecks = 0
let denyAtCheck = Number.POSITIVE_INFINITY

describe("DepositGuard reminder delivery", () => {
  before(async () => {
    await mock.module("@/lib/billing/financialJobAccess", { namedExports: {
      getFinancialJobAccessSkip: async () => ++accessChecks >= denyAtCheck
        ? { status: "skipped", reason: "no_access" } : null,
    } })
    // @ts-expect-error node:test module mock typings are narrower than this runtime stub
    await mock.module("@/lib/db/admin", {
      exports: {
        prismaAdmin: {
          depositReminder: {
            findUnique: async () => reminderRow,
            update: async ({ data }: { data: Record<string, unknown> }) => {
              if (!reminderRow) throw new Error("missing reminder")
              reminderRow = {
                ...reminderRow,
                deliveryStatus: (data.deliveryStatus as string | undefined) ?? reminderRow.deliveryStatus,
                providerMessageId:
                  (data.providerMessageId as string | null | undefined) ?? reminderRow.providerMessageId,
                failureReason: (data.failureReason as string | null | undefined) ?? reminderRow.failureReason,
              }
              return reminderRow
            },
          },
          depositGuardEvent: {
            create: async ({ data }: { data: { eventType: string } }) => {
              auditEvents.push({ eventType: data.eventType })
              return data
            },
          },
        },
      },
    } as never)

    // @ts-expect-error node:test module mock typings are narrower than this runtime stub
    await mock.module("@/lib/email/sendDepositReminder", {
      exports: {
        sendDepositReminderEmail: async (input: { recipientEmail: string; reminderType: string }) => {
          sentMessages.push({ to: input.recipientEmail, subject: input.reminderType })
          return "msg_123"
        },
      },
    } as never)
  })

  beforeEach(() => {
    accessChecks = 0
    denyAtCheck = Number.POSITIVE_INFINITY
    sentMessages = []
    auditEvents.length = 0
    reminderRow = {
      id: "rem_1",
      userId: "user_1",
      reminderType: "initial_request",
      scheduledFor: new Date("2026-09-12T00:00:00.000Z"),
      deliveryStatus: "pending",
      providerMessageId: null,
      failureReason: null,
      depositRequest: {
        id: "req_1",
        jobId: "job_1",
        status: "requested",
        description: "Deposit for project",
        amountCents: 18_000,
        totalAmountCents: 18_000,
        currency: "aud",
        dueDate: new Date("2026-09-20T00:00:00.000Z"),
        externalPaymentUrl: "https://pay.example.test/deposit/abc",
        job: {
          userProfile: { displayName: "Acme Projects" },
          customer: {
            financialContact: { name: "Client One", email: "client@example.com" },
          },
        },
      },
    }
  })

  for (const boundary of [1, 2]) {
    test(`denied access at boundary ${boundary} retains pending delivery without send or success event`, async () => {
      denyAtCheck = boundary
      const { processDepositReminder } = await import("@/lib/depositGuard/reminderDelivery")
      assert.deepEqual(await processDepositReminder("rem_1"), { status: "skipped", reason: "no_access" })
      assert.equal(reminderRow?.deliveryStatus, "pending")
      assert.equal(sentMessages.length, 0)
      assert.equal(auditEvents.length, 0)
    })
  }

  test("sends a due reminder and records audit output", async () => {
    const { processDepositReminder } = await import("@/lib/depositGuard/reminderDelivery")
    const result = await processDepositReminder("rem_1")

    assert.equal(result.status, "sent")
    assert.equal(sentMessages.length, 1)
    assert.equal(reminderRow?.deliveryStatus, "sent")
    assert.equal(reminderRow?.providerMessageId, "msg_123")
    assert.equal(auditEvents[0]?.eventType, "reminder_sent")
  })

  test("skips reminders for paid requests and cancels the pending row", async () => {
    if (!reminderRow) throw new Error("missing reminder")
    reminderRow.depositRequest.status = "paid"

    const { processDepositReminder } = await import("@/lib/depositGuard/reminderDelivery")
    const result = await processDepositReminder("rem_1")

    assert.equal(result.status, "skipped")
    assert.equal(result.reason, "request_paid")
    assert.equal(sentMessages.length, 0)
    assert.equal(reminderRow?.deliveryStatus, "cancelled")
  })
})
