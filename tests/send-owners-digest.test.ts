import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let sendCalls: Array<{ subject: string; to: string }> = []
let existingDelivery: { status: string; messageId?: string | null } | null = null
let savedDeliveries: Array<{ status: string; deliveryKey: string; messageId?: string | null }> = []
let generatedDigestId = "digest-1"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sendOwnersDigest: any

describe("sendOwnersDigest", () => {
  before(async () => {
    await mock.module("resend", {
      namedExports: {
        Resend: class {
          emails = {
            send: async (args: { subject: string; to: string }) => {
              sendCalls.push({ subject: args.subject, to: args.to })
              return { data: { id: "msg_123" } }
            },
          }
        },
      },
    })

    await mock.module("@supabase/supabase-js", {
      namedExports: {
        createClient: () => ({
          auth: {
            admin: {
              getUserById: async () => ({ data: { user: { email: "owner@example.com" } } }),
            },
          },
        }),
      },
    })

    await mock.module("@/lib/config/supabaseEnvironmentRuntime", {
      namedExports: {
        getPublicSupabaseEnvironment: () => ({ publicUrl: "https://example.supabase.co" }),
      },
    })

    await mock.module("@/lib/ownersDigest/recipient", {
      namedExports: {
        fetchOwnersDigestRecipientEmail: async () => "owner@example.com",
      },
    })

    await mock.module("@/lib/ownersDigest/service", {
      namedExports: {
        generateOwnersDigest: async () => ({
          id: generatedDigestId,
          frequency: "weekly",
          periodLabel: "Week",
          periodStart: new Date("2026-01-12T00:00:00.000Z"),
          periodEnd: new Date("2026-01-18T23:59:59.999Z"),
          status: "watch",
          summary: "Two items need attention.",
          summaryMode: "deterministic",
          dataAsOf: new Date("2026-01-12T07:00:00.000Z"),
          generatedAt: new Date("2026-01-12T07:00:00.000Z"),
          lastRegeneratedAt: new Date("2026-01-12T07:00:00.000Z"),
          generationSource: "scheduled",
          generationState: "complete",
          completenessStatus: "complete",
          completenessSummary: null,
          statusReason: "Overdue invoices increased",
          items: [
            {
              id: "item-1",
              source: "paidsoon",
              signalType: "OVERDUE_30_PLUS",
              title: "Overdue invoices increased",
              summary: "A large invoice is overdue.",
              severity: "warning",
              recommendedAction: "Review invoices",
              actionUrl: "/dashboard/invoices",
              whyItMatters: "Cash is delayed.",
              financialImpactCents: 15000,
              detectedAt: new Date("2026-01-12T07:00:00.000Z"),
              priorityScore: 60,
              section: "needs_attention",
              contributingSources: ["paidsoon"],
            },
          ],
          metrics: [],
          providers: [],
          created: true,
        }),
      },
    })

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          userProfile: {
            findUnique: async () => ({ displayName: "Owner", subscriptionTier: "small_business" }),
          },
          ownersDigestSetting: {
            findUnique: async () => ({
              enabled: true,
              emailEnabled: true,
              frequency: "weekly",
              deliveryDay: "monday",
              deliveryTime: "07:00",
              recipientScope: "owner_only",
              sendWhenEmpty: true,
            }),
          },
          ownersDigestDelivery: {
            findUnique: async () => existingDelivery,
            upsert: async (args: { create: { deliveryKey: string }; update: { deliveryKey?: string } }) => {
              savedDeliveries.push({ status: "pending", deliveryKey: args.create.deliveryKey })
              return {}
            },
            update: async (args: { data: { status: string; messageId?: string | null } }) => {
              savedDeliveries.push({ status: args.data.status, deliveryKey: "weekly:2026-01-12T00:00:00.000Z:owner_only", messageId: args.data.messageId ?? null })
              return {}
            },
          },
        },
      },
    })

    ;({ sendOwnersDigest } = await import("@/lib/email/sendOwnersDigest"))
  })

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.RESEND_FROM_NAME = "PaidSoon"
    process.env.RESEND_FROM_EMAIL = "digest@example.com"
    process.env.SUPABASE_SECRET_KEY = "supabase-secret"
    sendCalls = []
    existingDelivery = null
    savedDeliveries = []
    generatedDigestId = "digest-1"
  })

  test("skips when digest is not due for the current hour", async () => {
    const result = await sendOwnersDigest("user-1", new Date("2026-01-12T06:00:00.000Z"))
    assert.deepEqual(result, { status: "skipped", reason: "owners_digest_not_due" })
    assert.equal(sendCalls.length, 0)
  })

  test("returns already_sent when the delivery key was already sent", async () => {
    existingDelivery = { status: "sent", messageId: "msg_existing" }
    const result = await sendOwnersDigest("user-1", new Date("2026-01-12T07:00:00.000Z"))

    assert.deepEqual(result, { status: "already_sent", messageId: "msg_existing" })
    assert.equal(sendCalls.length, 0)
  })

  test("sends the digest and records delivery state", async () => {
    const result = await sendOwnersDigest("user-1", new Date("2026-01-12T07:00:00.000Z"))

    assert.equal(result.status, "sent")
    assert.equal(savedDeliveries.some((entry) => entry.status === "sent"), true)
  })
})
