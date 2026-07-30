/**
 * Covers sendFollowUpEmail persisting the rendered htmlBody/textBody onto the
 * created EmailLog row (email-arrangement-detail-modal change), for both the
 * default template and a custom EmailTemplate.
 *
 * Uses node:test's mock.module() to stub @/lib/db/admin (prismaAdmin) so no
 * real DB calls happen. Exercises the suppressed-send branch (reserved/
 * undeliverable recipient domain) so the real Resend SDK is never invoked —
 * the rendered subject/html/text are computed identically on this branch,
 * before the deliverability check, so this fully covers the persistence
 * behaviour without a real (or mocked) network call.
 */

import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let lastEmailLogCreateArgs: { data: { htmlBody?: string; textBody?: string; subject?: string } } | null = null
let mockCustomTemplate: {
  subject: string
  htmlBody: string
  textBody: string
} | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sendFollowUpEmail: any

describe("sendFollowUpEmail — EmailLog body persistence", () => {
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
            findUnique: async () => mockCustomTemplate,
          },
          trackedInvoice: {
            update: async () => ({}),
          },
          emailLog: {
            create: async (args: unknown) => {
              lastEmailLogCreateArgs = args as typeof lastEmailLogCreateArgs
              return {}
            },
          },
        },
      },
    })

    ;({ sendFollowUpEmail } = await import("@/lib/email/send"))
  })

  beforeEach(() => {
    lastEmailLogCreateArgs = null
    mockCustomTemplate = null
  })

  test("persists rendered htmlBody/textBody from the default template", async () => {
    const invoice = {
      id: "inv-1",
      userId: "user-1",
      clientEmail: "client@example.test", // reserved TLD — send is suppressed, never reaches Resend
      clientName: "Client Co",
      amountDue: 10_000,
      currency: "usd",
      dueDate: new Date("2026-01-01"),
      p2pToken: null,
    }

    const messageId = await sendFollowUpEmail(invoice, 1, "freelancer@example.com", "Freelancer Name")

    assert.equal(messageId, "suppressed-undeliverable-domain")
    assert.ok(lastEmailLogCreateArgs)
    assert.ok(lastEmailLogCreateArgs!.data.htmlBody && lastEmailLogCreateArgs!.data.htmlBody.length > 0)
    assert.ok(lastEmailLogCreateArgs!.data.textBody && lastEmailLogCreateArgs!.data.textBody.length > 0)
    assert.ok(lastEmailLogCreateArgs!.data.htmlBody!.includes("Client Co"))
  })

  test("persists rendered, sanitized htmlBody/textBody from a custom EmailTemplate", async () => {
    mockCustomTemplate = {
      subject: "Reminder for {{clientName}}",
      htmlBody: "<p>Hi {{clientName}}, please pay {{amountDue}}.</p><script>alert('x')</script>",
      textBody: "Hi {{clientName}}, please pay {{amountDue}}.",
    }

    const invoice = {
      id: "inv-2",
      userId: "user-1",
      clientEmail: "client@example.invalid", // reserved TLD — send is suppressed, never reaches Resend
      clientName: "Custom Template Client",
      amountDue: 5_000,
      currency: "usd",
      dueDate: new Date("2026-01-01"),
      p2pToken: null,
    }

    const messageId = await sendFollowUpEmail(invoice, 2, "freelancer@example.com", "Freelancer Name")

    assert.equal(messageId, "suppressed-undeliverable-domain")
    assert.ok(lastEmailLogCreateArgs)
    assert.ok(lastEmailLogCreateArgs!.data.htmlBody!.includes("Custom Template Client"))
    assert.ok(!lastEmailLogCreateArgs!.data.htmlBody!.includes("<script>"))
    assert.ok(lastEmailLogCreateArgs!.data.textBody!.includes("Custom Template Client"))
  })
})

