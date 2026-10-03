import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let user: { id: string } | null = { id: "xero-owner" }
let existingConnection = false
let persistFailure = false
let triggerFailure = false
let upsertArgs: Record<string, unknown> | null = null
let userContextUserId: string | null = null
let triggerArgs: string[][] = []
let organisations = [{ id: "org-1", name: "Xero Org" }]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let callback: any

before(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  process.env.XERO_REDIRECT_URI = "http://localhost:3000/api/integrations/xero/callback"

  await mock.module("@/lib/supabase/server", {
    namedExports: { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  })
  await mock.module("@/lib/db/admin", {
    namedExports: { prismaAdmin: { oauthState: {
      findUnique: async () => ({ userId: "xero-owner", provider: "xero", expiresAt: new Date(Date.now() + 60_000) }),
      delete: async () => ({}),
    } } },
  })
  await mock.module("@/lib/billing", {
    namedExports: {
      countActiveInvoiceSources: async () => 0,
      getInvoiceSourceLimitForTier: () => 5,
    },
  })
  await mock.module("@/lib/db/withUserContext", {
    namedExports: { withUserContext: async (userId: string, fn: (tx: unknown) => Promise<unknown>) => {
      userContextUserId = userId
      if (persistFailure) throw new Error("database unavailable")
      return fn({
        accountingConnection: {
          findUnique: async () => existingConnection ? { id: "conn-existing" } : null,
          upsert: async (args: Record<string, unknown>) => {
            upsertArgs = args
            return { id: existingConnection ? "conn-existing" : "conn-new" }
          },
        },
        userProfile: { findUnique: async () => ({ subscriptionTier: "business_control" }) },
        invoiceConnection: { count: async () => 0 },
      })
    } },
  })
  await mock.module("@/lib/providers/accounting", {
    namedExports: { getAccountingProvider: () => ({
      exchangeCodeForTokens: async () => ({
        accessToken: "access-token", refreshToken: "refresh-token", expiresIn: 1800, scope: "offline_access accounting.transactions",
      }),
      getOrganisations: async () => organisations,
    }) },
  })
  await mock.module("@/lib/providers/accounting/crypto", {
    namedExports: { encryptToken: (value: string) => `encrypted:${value}` },
  })
  await mock.module("@/lib/providers/accounting/triggerSyncNow", {
    namedExports: { triggerSyncNow: async (connectionId: string, userId: string) => {
      triggerArgs.push([connectionId, userId])
      if (triggerFailure) throw new Error("worker secret or response detail")
      return { queued: true, claimId: "claim-1" }
    } },
  })

  ;({ GET: callback } = await import("@/app/api/integrations/xero/callback/route"))
})

beforeEach(() => {
  user = { id: "xero-owner" }
  existingConnection = false
  persistFailure = false
  triggerFailure = false
  upsertArgs = null
  userContextUserId = null
  triggerArgs = []
  organisations = [{ id: "org-1", name: "Xero Org" }]
})

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/integrations/xero/callback?code=oauth-code&state=nonce")
}

function locationOf(response: Response): string {
  return response.headers.get("location") ?? ""
}

describe("Xero callback route", () => {
  test("saves a pending connection and triggers sync after owner-scoped commit", async () => {
    const response = await callback(makeRequest())
    const args = upsertArgs as { create: Record<string, unknown>; update: Record<string, unknown> }
    assert.equal(args.create.status, "pending_first_sync")
    assert.equal(args.update.status, "pending_first_sync")
    assert.equal(args.update.lastSyncedAt, null)
    assert.deepEqual(triggerArgs, [["conn-new", "xero-owner"]])
    assert.equal(userContextUserId, "xero-owner")
    assert.equal(locationOf(response), "http://localhost:3000/dashboard/settings/connections?source=xero&code=connected")
  })

  test("reconnects the same organisation and triggers using the saved connection id", async () => {
    existingConnection = true
    const response = await callback(makeRequest())
    assert.deepEqual(triggerArgs, [["conn-existing", "xero-owner"]])
    assert.equal((upsertArgs as { update: Record<string, unknown> }).update.lastSyncedAt, null)
    assert.equal(locationOf(response), "http://localhost:3000/dashboard/settings/connections?source=xero&code=connected")
  })

  test("keeps the settings redirect when triggering fails", async () => {
    triggerFailure = true
    const response = await callback(makeRequest())
    assert.deepEqual(triggerArgs, [["conn-new", "xero-owner"]])
    assert.equal(locationOf(response), "http://localhost:3000/dashboard/settings/connections?source=xero&code=connected")
  })

  test("redirects safely and does not trigger when persistence fails", async () => {
    persistFailure = true
    const response = await callback(makeRequest())
    assert.deepEqual(triggerArgs, [])
    assert.equal(locationOf(response), "http://localhost:3000/dashboard/settings/connections?source=xero&code=connection_save_failed")
  })

})
