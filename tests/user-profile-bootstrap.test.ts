import { before, beforeEach, afterEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

class AuthApiError extends Error {
  name = "AuthApiError"
}

// ---------------------------------------------------------------------------
// POST /api/auth/sign-up — profile bootstrap on immediate-session branch
// ---------------------------------------------------------------------------

type SignUpResult = {
  data: { user: { id: string } | null; session: unknown }
  error: Error | null
}

const TEST_USER_ID = "signup-test-user-id"

let signUpResult: SignUpResult = {
  data: { user: { id: TEST_USER_ID }, session: { access_token: "token" } },
  error: null,
}
let createUserProfileCalls: string[] = []
let signUpPOST: (request: Request) => Promise<Response>

describe("POST /api/auth/sign-up profile bootstrap", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            signUp: async () => signUpResult,
          },
        }),
      },
    })

    await mock.module("@/lib/actions/auth", {
      namedExports: {
        createUserProfile: async (userId: string) => {
          createUserProfileCalls.push(userId)
        },
      },
    })

    ;({ POST: signUpPOST } = await import("@/app/api/auth/sign-up/route"))
  })

  beforeEach(() => {
    createUserProfileCalls = []
    mock.restoreAll()
  })

  afterEach(() => {
    mock.restoreAll()
  })

  function makeRequest(body: unknown) {
    return new Request("https://paidsoon.test/api/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  test("bootstraps a profile when Supabase returns an immediate session", async () => {
    signUpResult = {
      data: { user: { id: TEST_USER_ID }, session: { access_token: "token" } },
      error: null,
    }

    const response = await signUpPOST(
      makeRequest({ email: "new-user@example.com", password: "password123", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, status: "session" })
    assert.deepEqual(createUserProfileCalls, [TEST_USER_ID])
  })

  test("does not bootstrap a profile when email confirmation is required", async () => {
    signUpResult = {
      data: { user: { id: TEST_USER_ID }, session: null },
      error: null,
    }

    const response = await signUpPOST(
      makeRequest({ email: "new-user@example.com", password: "password123", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, status: "check-email" })
    assert.deepEqual(createUserProfileCalls, [])
  })

  test("does not bootstrap a profile when Supabase rejects sign-up", async () => {
    signUpResult = {
      data: { user: null, session: null },
      error: new Error("User already registered"),
    }

    const response = await signUpPOST(
      makeRequest({ email: "new-user@example.com", password: "password123", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 400)
    assert.deepEqual(createUserProfileCalls, [])
  })

  test("returns 503 when Supabase CAPTCHA protection is misconfigured", async () => {
    signUpResult = {
      data: { user: null, session: null },
      error: new AuthApiError("captcha protection: request disallowed (invalid-input-secret)"),
    }

    const response = await signUpPOST(
      makeRequest({ email: "new-user@example.com", password: "password123", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: "Authentication service unavailable" })
    assert.deepEqual(createUserProfileCalls, [])
  })
})

// ---------------------------------------------------------------------------
// createUserProfile — idempotency contract
// ---------------------------------------------------------------------------

type UpsertCall = { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown> }

let userProfileUpsertCalls: UpsertCall[] = []
let scheduleUpsertCalls: UpsertCall[] = []
let createUserProfile: (userId: string) => Promise<void>

describe("createUserProfile idempotency", () => {
  before(async () => {
    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
          userProfile: {
            upsert: async (args: UpsertCall) => {
              userProfileUpsertCalls.push(args)
              return { userId: args.where.userId }
            },
          },
          schedule: {
            upsert: async (args: UpsertCall) => {
              scheduleUpsertCalls.push(args)
              return { userId: args.where.userId }
            },
          },
        },
      },
    })

    ;({ createUserProfile } = await import("@/lib/actions/auth"))
  })

  beforeEach(() => {
    userProfileUpsertCalls = []
    scheduleUpsertCalls = []
  })

  test("calling createUserProfile twice for the same user issues two safe upserts, not a duplicate create", async () => {
    await createUserProfile(TEST_USER_ID)
    await createUserProfile(TEST_USER_ID)

    assert.equal(userProfileUpsertCalls.length, 2)
    assert.equal(scheduleUpsertCalls.length, 2)
    for (const call of [...userProfileUpsertCalls, ...scheduleUpsertCalls]) {
      assert.deepEqual(call.where, { userId: TEST_USER_ID })
      // update: {} on repeat calls means an existing row is left untouched, not overwritten
      assert.deepEqual(call.update, {})
    }
  })
})
