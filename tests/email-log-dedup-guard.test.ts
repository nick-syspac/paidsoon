/**
 * Covers the reminder-email deduplication guard added for
 * add-email-log-dedup-guard: sendFollowUpEmail() must skip sending when an
 * EmailLog row already exists for the target (trackedInvoiceId, stage) pair
 * (fast-path check), and must treat a Prisma P2002 unique-constraint
 * violation on EmailLog.create() as an "already sent" outcome rather than a
 * hard failure — the durable backstop for a genuine race between two
 * concurrent send attempts.
 *
 * Uses node:test's mock.module() to stub @/lib/db/admin (prismaAdmin) so no
 * real DB calls happen. Uses a reserved/undeliverable recipient domain (as in
 * tests/email-log-body.test.ts) so the real Resend SDK is never invoked —
 * the fast-path check and the create()/P2002 handling run identically before
 * and after the deliverability check, so this fully covers the dedup
 * behaviour without a real (or mocked) network call.
 */

import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { Prisma } from "@/lib/generated/prisma/client"

let findFirstResult: { id: string } | null = null
let createBehavior: "succeed" | "p2002" = "succeed"
let createCallCount = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sendFollowUpEmail: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ALREADY_SENT_MESSAGE_ID: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SUPPRESSED_MESSAGE_ID: any

describe("sendFollowUpEmail — duplicate-send guard", () => {
  before(async () => {
    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          userProfile: {
            findUnique: async () => ({ subscriptionTier: "starter" }),
          },
          emailSettings: {
            findUnique: async () => null,
          },
          emailTemplate: {
            findUnique: async () => null,
          },
          trackedInvoice: {
            update: async () => ({}),
          },
          emailLog: {
            findFirst: async () => findFirstResult,
            create: async () => {
              createCallCount++
              if (createBehavior === "p2002") {
                throw new Prisma.PrismaClientKnownRequestError(
                  "Unique constraint failed on the fields: (`trackedInvoiceId`,`stage`)",
                  { code: "P2002", clientVersion: "test" }
                )
              }
              return {}
            },
          },
        },
      },
    })

    ;({ sendFollowUpEmail, ALREADY_SENT_MESSAGE_ID, SUPPRESSED_MESSAGE_ID } = await import(
      "@/lib/email/send"
    ))
  })

  beforeEach(() => {
    findFirstResult = null
    createBehavior = "succeed"
    createCallCount = 0
  })

  const invoice = {
    id: "inv-dedup-1",
    userId: "user-1",
    clientEmail: "client@example.test", // reserved TLD — send is suppressed, never reaches Resend
    clientName: "Client Co",
    amountDue: 10_000,
    currency: "usd",
    dueDate: new Date("2026-01-01"),
    p2pToken: null,
  }

  test("skips sending and never calls EmailLog.create when a log already exists for this stage", async () => {
    findFirstResult = { id: "existing-log-1" }

    const result = await sendFollowUpEmail(invoice, 1, "freelancer@example.com", "Freelancer")

    assert.equal(result, ALREADY_SENT_MESSAGE_ID)
    assert.equal(createCallCount, 0)
  })

  test("treats a concurrent P2002 unique-constraint violation as already-sent, not an error", async () => {
    // Both attempts pass the fast-path check (simulating the race window
    // between two concurrent cron invocations for the same stage).
    findFirstResult = null

    createBehavior = "succeed"
    const winner = await sendFollowUpEmail(invoice, 1, "freelancer@example.com", "Freelancer")
    assert.equal(winner, SUPPRESSED_MESSAGE_ID)
    assert.equal(createCallCount, 1)

    createBehavior = "p2002"
    const loser = await sendFollowUpEmail(invoice, 1, "freelancer@example.com", "Freelancer")

    // The DB's @@unique([trackedInvoiceId, stage]) constraint is what
    // guarantees only the winner's row is actually persisted; here we assert
    // the application layer surfaces the loser's violation as a non-error,
    // dedup outcome rather than a hard failure.
    assert.equal(loser, ALREADY_SENT_MESSAGE_ID)
    assert.equal(createCallCount, 2)
  })
})
