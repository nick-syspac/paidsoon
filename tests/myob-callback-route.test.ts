/**
 * API route handler tests for the MYOB OAuth callback
 * (app/api/integrations/myob/callback/route.ts).
 *
 * Covers the fixed company-file identification logic: reading `businessId`/
 * `businessName` directly from the callback query string, constructing the
 * cf_uri, falling back to a deterministic name when `businessName` is
 * absent, and never redirecting to a company-file selection page (that flow
 * was retired — see openspec/changes/fix-myob-company-file-identity).
 *
 * Uses Node's built-in mock.module() to stub all external dependencies
 * (Supabase, Prisma, the accounting provider, sync). No real DB, network,
 * or provider calls are made.
 */
import { describe, test, mock, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

// ─── Module-scope stubs (accessible across tsx re-evaluations) ───────────────

let mockUser: { id: string } | null = { id: "user-123" }
let mockOauthState: { userId: string; provider: string; expiresAt: Date } | null = null
let upsertArgs: unknown = null
let syncConnectionCalledWith: string | null = null
let exchangeCodeForTokensResult: unknown = {
  accessToken: "at-myob",
  refreshToken: "rt-myob",
  expiresIn: 1200,
  scope: "sme-sales sme-contacts-customer sme-company-file",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let callbackRoute: any

describe("MYOB callback route", () => {
  before(async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
    process.env.MYOB_REDIRECT_URI = "http://localhost:3000/api/integrations/myob/callback"

    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          oauthState: {
            findUnique: async () => mockOauthState,
            delete: async () => ({}),
          },
        },
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          const tx = {
            accountingConnection: {
              upsert: async (args: unknown) => {
                upsertArgs = args
                return { id: "conn-1" }
              },
            },
          }
          return fn(tx)
        },
      },
    })

    await mock.module("@/lib/providers/accounting", {
      namedExports: {
        getAccountingProvider: () => ({
          exchangeCodeForTokens: async () => exchangeCodeForTokensResult,
        }),
      },
    })

    await mock.module("@/lib/providers/accounting/crypto", {
      namedExports: {
        encryptToken: (value: string) => `encrypted(${value})`,
      },
    })

    await mock.module("@/lib/providers/accounting/sync", {
      namedExports: {
        syncConnection: async (connectionId: string) => {
          syncConnectionCalledWith = connectionId
          return {}
        },
      },
    })

    // Dynamic import happens AFTER mocks are registered
    ;({ GET: callbackRoute } = await import("@/app/api/integrations/myob/callback/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockOauthState = {
      userId: "user-123",
      provider: "myob",
      expiresAt: new Date(Date.now() + 60_000),
    }
    upsertArgs = null
    syncConnectionCalledWith = null
    exchangeCodeForTokensResult = {
      accessToken: "at-myob",
      refreshToken: "rt-myob",
      expiresIn: 1200,
      scope: "sme-sales sme-contacts-customer sme-company-file",
    }
  })

  function makeRequest(params: Record<string, string>): Request {
    const url = new URL("http://localhost:3000/api/integrations/myob/callback")
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
    return new Request(url.toString())
  }

  function locationOf(res: Response): string {
    return res.headers.get("location") ?? ""
  }

  test("redirects with missing_params when businessId is absent", async () => {
    const res = await callbackRoute(
      makeRequest({ code: "abc", state: "xyz" /* no businessId */ })
    )
    assert.equal(
      locationOf(res),
      "http://localhost:3000/dashboard/settings/connections?source=myob&code=missing_params"
    )
    assert.equal(upsertArgs, null)
  })

  test("constructs organisationId as the online API host + businessId", async () => {
    await callbackRoute(
      makeRequest({
        code: "abc",
        state: "xyz",
        businessId: "03d16673-d860-426e-a6b7-382ed3cf5cd2",
        businessName: "Bob Co Pty Ltd",
      })
    )

    const args = upsertArgs as {
      create: { organisationId: string; organisationName: string }
    }
    assert.equal(
      args.create.organisationId,
      "https://api.myob.com/accountright/03d16673-d860-426e-a6b7-382ed3cf5cd2"
    )
    assert.equal(args.create.organisationName, "Bob Co Pty Ltd")
  })

  test("falls back to a deterministic name when businessName is absent", async () => {
    await callbackRoute(
      makeRequest({
        code: "abc",
        state: "xyz",
        businessId: "03d16673-d860-426e-a6b7-382ed3cf5cd2",
        // no businessName
      })
    )

    const args = upsertArgs as { create: { organisationName: string } }
    assert.equal(
      args.create.organisationName,
      "MYOB Company File 03d16673-d860-426e-a6b7-382ed3cf5cd2"
    )
  })

  test("falls back to a deterministic name when businessName is blank", async () => {
    await callbackRoute(
      makeRequest({
        code: "abc",
        state: "xyz",
        businessId: "03d16673-d860-426e-a6b7-382ed3cf5cd2",
        businessName: "   ",
      })
    )

    const args = upsertArgs as { create: { organisationName: string } }
    assert.equal(
      args.create.organisationName,
      "MYOB Company File 03d16673-d860-426e-a6b7-382ed3cf5cd2"
    )
  })

  test("triggers an inline first sync and redirects to connected on success", async () => {
    const res = await callbackRoute(
      makeRequest({
        code: "abc",
        state: "xyz",
        businessId: "03d16673-d860-426e-a6b7-382ed3cf5cd2",
        businessName: "Bob Co Pty Ltd",
      })
    )
    assert.equal(syncConnectionCalledWith, "conn-1")
    assert.equal(
      locationOf(res),
      "http://localhost:3000/dashboard/settings/connections?source=myob&code=connected"
    )
  })

  test("never redirects to a company-file selection page", async () => {
    const res = await callbackRoute(
      makeRequest({
        code: "abc",
        state: "xyz",
        businessId: "03d16673-d860-426e-a6b7-382ed3cf5cd2",
        businessName: "Bob Co Pty Ltd",
      })
    )
    assert.ok(!locationOf(res).includes("select-org"))
  })

  test("redirects with invalid_state when the nonce is unknown", async () => {
    mockOauthState = null
    const res = await callbackRoute(
      makeRequest({ code: "abc", state: "unknown", businessId: "biz-1" })
    )
    assert.equal(
      locationOf(res),
      "http://localhost:3000/dashboard/settings/connections?source=myob&code=invalid_state"
    )
  })

  test("redirects to sign-in when the authenticated user does not match the nonce's user", async () => {
    mockUser = { id: "someone-else" }
    const res = await callbackRoute(
      makeRequest({ code: "abc", state: "xyz", businessId: "biz-1" })
    )
    assert.equal(locationOf(res), "http://localhost:3000/sign-in")
  })

  test("redirects with cancelled when MYOB reports an error", async () => {
    const res = await callbackRoute(makeRequest({ error: "access_denied" }))
    assert.equal(
      locationOf(res),
      "http://localhost:3000/dashboard/settings/connections?source=myob&code=cancelled"
    )
  })
})
