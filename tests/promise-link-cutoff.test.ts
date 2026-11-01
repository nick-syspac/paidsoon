import assert from "node:assert/strict"
import { afterEach, before, mock, test } from "node:test"

let mockInvoice: Record<string, unknown> | null = null
let mockProfile: { accountDisplayFromDate: Date | null } | null = null

before(async () => {
  await mock.module("@/lib/db/admin", {
    namedExports: {
      prismaAdmin: {
        trackedInvoice: {
          findUnique: async () => mockInvoice,
        },
        promiseEscalationPolicy: {
          findUnique: async () => null,
        },
        promiseToPay: {
          count: async () => 0,
          updateMany: async () => ({ count: 0 }),
          create: async () => ({ id: "promise-id" }),
        },
        userProfile: {
          findUnique: async () => mockProfile,
        },
        $transaction: async (steps: unknown[]) => steps,
      },
    },
  })

  await mock.module("@/lib/email/send", {
    namedExports: {
      sendP2PNotification: async () => undefined,
      resolveFreelancerName: () => "Freelancer",
    },
  })

  await mock.module("@supabase/supabase-js", {
    namedExports: {
      createClient: () => ({
        auth: {
          admin: {
            getUserById: async () => ({ data: { user: { email: "owner@example.com", user_metadata: { full_name: "Owner" } } } }),
          },
        },
      }),
    },
  })

  await mock.module("@/lib/config/supabaseEnvironmentRuntime", {
    namedExports: {
      getPublicSupabaseEnvironment: () => ({ publicUrl: "https://example.com" }),
    },
  })

  await mock.module("@/lib/promiseEscalationPolicy", {
    namedExports: {
      resolvePromiseEscalationPolicy: () => ({ retryLimit: 99, escalationThreshold: 99, timingEscalationEnabled: false, toneEscalationEnabled: false }),
      shouldBlockClientPromise: () => false,
    },
  })
})

afterEach(() => {
  mock.restoreAll()
})

test("public promise links reject invoices older than the account display cutoff", async () => {
  mockInvoice = {
    id: "inv-old",
    userId: "user-1",
    status: "pending",
    p2pToken: "abc123",
    financialInvoice: {
      amountDueCents: 1000,
      currency: "aud",
      issueDate: new Date("2026-08-01T00:00:00Z"),
      dueDate: new Date("2026-08-05T00:00:00Z"),
      contact: { emailLower: "client@example.com" },
    },
  }
  mockProfile = { accountDisplayFromDate: new Date("2026-09-01T00:00:00Z") }

  const { POST } = await import("@/app/api/promise/[token]/route")
  const response = await POST(
    new Request("https://example.com/promise/abc123", {
      method: "POST",
      body: JSON.stringify({ promisedPayBy: "2026-12-01T00:00:00Z", promisedAmount: 1000 }),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ token: "abc123" }) },
  )

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: "Link not found" })
})
