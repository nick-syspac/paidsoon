import { before, beforeEach, afterEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { TRACE_DEBUG_HEADER, TRACE_ID_HEADER } from "@/lib/diagnostics/shared"

class AuthApiError extends Error {
  name = "AuthApiError"
}

type SignInResult = {
  error: Error | null
  data?: { user: { id: string } } | null
}

const TEST_USER_ID = "user-test-id"

let signInResult: SignInResult = { error: null, data: { user: { id: TEST_USER_ID } } }
let signInArgs: unknown = null
let createUserProfileCalls: string[] = []
let POST: (request: Request) => Promise<Response>

describe("POST /api/auth/sign-in diagnostic tracing", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            signInWithPassword: async (args: unknown) => {
              signInArgs = args
              return signInResult
            },
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

    ;({ POST } = await import("@/app/api/auth/sign-in/route"))
  })

  beforeEach(() => {
    signInResult = { error: null, data: { user: { id: TEST_USER_ID } } }
    signInArgs = null
    createUserProfileCalls = []
    delete process.env.DEBUG
    mock.restoreAll()
  })

  afterEach(() => {
    delete process.env.DEBUG
    mock.restoreAll()
  })

  function makeRequest(body: unknown, traceId = "trace-test-123") {
    return new Request("https://paidsoon.test/api/auth/sign-in", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TRACE_ID_HEADER]: traceId,
      },
      body: JSON.stringify(body),
    })
  }

  test("DEBUG unset preserves response behaviour and emits no diagnostic logs", async () => {
    const info = mock.method(console, "info", () => undefined)

    const response = await POST(
      makeRequest({ email: "user@example.com", password: "secret-password", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.equal(response.headers.get(TRACE_DEBUG_HEADER), null)
    assert.equal(info.mock.callCount(), 0)
    assert.deepEqual(signInArgs, {
      email: "user@example.com",
      password: "secret-password",
      options: { captchaToken: "turnstile-token" },
    })
    assert.deepEqual(createUserProfileCalls, [TEST_USER_ID])
  })

  test("DEBUG=true emits structured success traces and diagnostic headers", async () => {
    process.env.DEBUG = "true"
    const info = mock.method(console, "info", () => undefined)

    const response = await POST(
      makeRequest({ email: "user@example.com", password: "secret-password", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get(TRACE_DEBUG_HEADER), "true")
    assert.equal(response.headers.get(TRACE_ID_HEADER), "trace-test-123")

    const output = info.mock.calls.map((call) => String(call.arguments[0])).join("\n")
    assert.match(output, /paidsoon.trace/)
    assert.match(output, /auth.sign_in.supabase_password/)
    assert.match(output, /"traceId":"trace-test-123"/)
    assert.ok(!output.includes("secret-password"))
    assert.ok(!output.includes("turnstile-token"))
  })

  test("DEBUG=true logs safe authentication failure details without leaking secrets", async () => {
    process.env.DEBUG = "true"
    signInResult = { error: new Error("Invalid credentials") }
    const info = mock.method(console, "info", () => undefined)
    const warn = mock.method(console, "warn", () => undefined)

    const response = await POST(
      makeRequest({ email: "user@example.com", password: "secret-password", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: "Invalid email or password" })

    const output = [...info.mock.calls, ...warn.mock.calls].map((call) => String(call.arguments[0])).join("\n")
    assert.match(output, /"event":"failure"/)
    assert.match(output, /Invalid credentials/)
    assert.ok(!output.includes("secret-password"))
    assert.ok(!output.includes("turnstile-token"))
  })

  test("returns 503 when Supabase rejects the configured publishable key", async () => {
    process.env.DEBUG = "true"
    signInResult = { error: new Error("Invalid API key") }
    const info = mock.method(console, "info", () => undefined)
    const warn = mock.method(console, "warn", () => undefined)

    const response = await POST(
      makeRequest({ email: "user@example.com", password: "secret-password", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: "Authentication service unavailable" })

    const output = [...info.mock.calls, ...warn.mock.calls].map((call) => String(call.arguments[0])).join("\n")
    assert.match(output, /"status":503/)
    assert.match(output, /Invalid API key/)
    assert.ok(!output.includes("secret-password"))
    assert.ok(!output.includes("turnstile-token"))
  })

  test("returns 503 when Supabase CAPTCHA protection is misconfigured", async () => {
    process.env.DEBUG = "true"
    signInResult = {
      error: new AuthApiError("captcha protection: request disallowed (invalid-input-secret)"),
    }
    const info = mock.method(console, "info", () => undefined)
    const warn = mock.method(console, "warn", () => undefined)

    const response = await POST(
      makeRequest({ email: "user@example.com", password: "secret-password", cfToken: "turnstile-token" }),
    )

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: "Authentication service unavailable" })

    const output = [...info.mock.calls, ...warn.mock.calls].map((call) => String(call.arguments[0])).join("\n")
    assert.match(output, /invalid-input-secret/)
    assert.match(output, /"status":503/)
    assert.ok(!output.includes("secret-password"))
    assert.ok(!output.includes("turnstile-token"))
  })
})
