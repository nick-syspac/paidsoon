/**
 * Covers that sendFollowUpEmail passes invoice.paymentUrl through to the
 * template renderer, producing a "Pay invoice" link when set and an empty
 * string when null.
 */

import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let lastEmailLogCreateArgs: { data: { htmlBody?: string; textBody?: string } } | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sendFollowUpEmail: any

describe("sendFollowUpEmail — paymentUrl passthrough", () => {
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
            findFirst: async () => null,
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
  })

  test("includes Pay invoice link when paymentUrl is set", async () => {
    const invoice = {
      id: "inv-pay-1",
      userId: "user-1",
      p2pToken: null,
      financialInvoice: {
        id: "finv-pay-1",
        amountDueCents: 10_000,
        currency: "usd",
        dueDate: new Date("2026-01-01"),
        paymentUrl: "https://invoice.stripe.com/i/acct_123/test_abc",
        contact: {
          email: "client@example.test", // reserved TLD — suppressed, never reaches Resend
          name: "Pay Link Client",
        },
      },
    }

    const messageId = await sendFollowUpEmail(invoice, 1, "freelancer@example.com", "Freelancer")

    assert.equal(messageId, "suppressed-undeliverable-domain")
    assert.ok(lastEmailLogCreateArgs?.data.htmlBody?.includes("https://invoice.stripe.com/i/acct_123/test_abc"))
    // Plain-text body must contain the raw URL, not HTML anchor markup
    assert.ok(lastEmailLogCreateArgs?.data.textBody?.includes("https://invoice.stripe.com/i/acct_123/test_abc"))
    assert.ok(!lastEmailLogCreateArgs!.data.textBody!.includes("<a href="))
  })

  test("omits payment link when paymentUrl is null", async () => {
    const invoice = {
      id: "inv-pay-2",
      userId: "user-1",
      p2pToken: null,
      financialInvoice: {
        id: "finv-pay-2",
        amountDueCents: 5_000,
        currency: "usd",
        dueDate: new Date("2026-01-01"),
        paymentUrl: null,
        contact: {
          email: "client@example.test",
          name: "No Link Client",
        },
      },
    }

    const messageId = await sendFollowUpEmail(invoice, 1, "freelancer@example.com", "Freelancer")

    assert.equal(messageId, "suppressed-undeliverable-domain")
    assert.ok(lastEmailLogCreateArgs?.data.htmlBody)
    assert.ok(!lastEmailLogCreateArgs!.data.htmlBody!.includes("Pay invoice"))
    assert.ok(lastEmailLogCreateArgs?.data.textBody)
    assert.ok(!lastEmailLogCreateArgs!.data.textBody!.includes("Pay invoice"))
    assert.ok(!lastEmailLogCreateArgs!.data.textBody!.includes("<a href="))
  })
})
