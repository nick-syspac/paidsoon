import { describe, test, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  TRACE_COOKIE_NAME,
  TRACE_DEBUG_HEADER,
  TRACE_ID_HEADER,
  createTraceContext,
  createTraceId,
  formatTraceEvent,
  getTraceIdFromCookieHeader,
  isSensitiveKey,
  redactForTrace,
  serialiseTraceEvent,
  summariseAuthForTrace,
  summariseErrorForTrace,
} from "@/lib/diagnostics/shared"
import {
  applyTraceResponseHeaders,
  createServerTraceContext,
  isProductionLikeEnvironment,
  parseDebugEnv,
  traceEvent,
  traceOperation,
} from "@/lib/diagnostics/server"

describe("diagnostic tracing configuration", () => {
  test("enables tracing only for case-insensitive true", () => {
    assert.equal(parseDebugEnv(undefined), false)
    assert.equal(parseDebugEnv(""), false)
    assert.equal(parseDebugEnv("false"), false)
    assert.equal(parseDebugEnv("not-a-bool"), false)
    assert.equal(parseDebugEnv(" true "), true)
    assert.equal(parseDebugEnv("TrUe"), true)
  })

  test("identifies production-like environments", () => {
    assert.equal(isProductionLikeEnvironment({ VERCEL_ENV: "production" }), true)
    assert.equal(isProductionLikeEnvironment({ APP_ENV: "staging" }), true)
    assert.equal(isProductionLikeEnvironment({ VERCEL_ENV: "preview", NODE_ENV: "test" }), false)
  })
})

describe("diagnostic trace context", () => {
  test("creates non-secret trace identifiers", () => {
    assert.match(createTraceId(), /^[a-zA-Z0-9._:-]{8,128}$/)
  })

  test("prefers header trace id, then cookie trace id, then generated id", () => {
    const headers = new Headers({ [TRACE_ID_HEADER]: "trace-header-123" })
    const fromHeader = createTraceContext({ debugEnabled: true, headers, cookieHeader: `${TRACE_COOKIE_NAME}=trace-cookie-123` })
    assert.equal(fromHeader.traceId, "trace-header-123")

    const fromCookie = createTraceContext({ debugEnabled: true, cookieHeader: `${TRACE_COOKIE_NAME}=trace-cookie-123` })
    assert.equal(fromCookie.traceId, "trace-cookie-123")

    const generated = createTraceContext({ debugEnabled: true })
    assert.match(generated.traceId, /^[a-zA-Z0-9._:-]{8,128}$/)
  })

  test("parses valid trace id from cookie header", () => {
    assert.equal(getTraceIdFromCookieHeader("foo=bar; paidsoon_trace_id=trace-abc-123"), "trace-abc-123")
    assert.equal(getTraceIdFromCookieHeader("paidsoon_trace_id=bad value"), null)
  })

  test("applies debug response headers and diagnostic cookie only when enabled", () => {
    const response = new Response(null)
    applyTraceResponseHeaders(response, { debugEnabled: true, traceId: "trace-abc-123" }, true)

    assert.equal(response.headers.get(TRACE_ID_HEADER), "trace-abc-123")
    assert.equal(response.headers.get(TRACE_DEBUG_HEADER), "true")
    assert.match(response.headers.get("set-cookie") ?? "", /paidsoon_trace_id=trace-abc-123/)
    assert.match(response.headers.get("set-cookie") ?? "", /Secure/)

    const disabledResponse = new Response(null)
    applyTraceResponseHeaders(disabledResponse, { debugEnabled: false, traceId: "trace-abc-123" }, false)
    assert.equal(disabledResponse.headers.get(TRACE_ID_HEADER), null)
  })
})

describe("diagnostic redaction", () => {
  test("matches sensitive field names and variants", () => {
    assert.equal(isSensitiveKey("password"), true)
    assert.equal(isSensitiveKey("access_token"), true)
    assert.equal(isSensitiveKey("Authorization"), true)
    assert.equal(isSensitiveKey("cfToken"), true)
    assert.equal(isSensitiveKey("clientName"), false)
  })

  test("redacts nested sensitive values, handles circular objects, and truncates long values", () => {
    const input: Record<string, unknown> = {
      email: "user@example.com",
      password: "super-secret-password",
      nested: {
        headers: {
          authorization: "Bearer token-value",
        },
        apiKey: "api-secret",
        longValue: "x".repeat(3_000),
      },
      list: [{ refresh_token: "refresh-secret" }],
    }
    input.self = input

    const redacted = redactForTrace(input) as Record<string, unknown>
    const serialised = JSON.stringify(redacted)

    assert.equal(redacted.password, "[REDACTED]")
    assert.ok(!serialised.includes("super-secret-password"))
    assert.ok(!serialised.includes("token-value"))
    assert.ok(!serialised.includes("api-secret"))
    assert.ok(!serialised.includes("refresh-secret"))
    assert.ok(serialised.includes("[Circular]"))
    assert.ok(serialised.includes("[truncated:"))
  })
})

describe("diagnostic event formatting and summaries", () => {
  test("formats structured trace events and serialises with event-level truncation", () => {
    const event = formatTraceEvent({
      traceId: "trace-abc-123",
      stage: "auth.sign_in",
      operation: "supabase.signInWithPassword",
      subsystem: "auth",
      component: "app/api/auth/sign-in/route.ts",
      event: "success",
      durationMs: 12,
      http: { method: "POST", route: "/api/auth/sign-in", status: 200 },
      inputs: { password: "hidden", safe: "visible" },
    })

    assert.equal(event.message, "paidsoon.trace")
    assert.equal(event.traceId, "trace-abc-123")
    assert.equal(event.inputs && typeof event.inputs === "object" && "safe" in event.inputs ? event.inputs.safe : null, "visible")
    assert.ok(!serialiseTraceEvent(event).includes("hidden"))
  })

  test("summarises auth and error objects without raw tokens", () => {
    const authSummary = summariseAuthForTrace({
      user: { email: "user@example.com", app_metadata: { provider: "email" }, role: "authenticated" },
      session: { access_token: "access-secret", refresh_token: "refresh-secret", expires_at: 123 },
    })
    assert.deepEqual(authSummary, {
      hasUser: true,
      hasEmail: true,
      provider: "email",
      role: "authenticated",
      hasSession: true,
      hasAccessCredential: true,
      hasRefreshCredential: true,
      hasExpiry: true,
    })

    const error = new Error("outer", { cause: new Error("inner token secret") })
    const summary = summariseErrorForTrace(error)
    const redacted = JSON.stringify(redactForTrace(summary))
    assert.ok(redacted.includes("outer"))
    assert.ok(!redacted.includes("access-secret"))
  })
})

describe("diagnostic trace emission", () => {
  const originalDebug = process.env.DEBUG

  beforeEach(() => {
    process.env.DEBUG = "true"
  })

  afterEach(() => {
    if (originalDebug === undefined) {
      delete process.env.DEBUG
    } else {
      process.env.DEBUG = originalDebug
    }
    mock.restoreAll()
  })

  test("does not evaluate lazy events when disabled", () => {
    process.env.DEBUG = "false"
    let evaluated = false

    traceEvent(() => {
      evaluated = true
      return {
        traceId: "trace-abc-123",
        stage: "disabled",
        operation: "noop",
        subsystem: "diagnostics",
        component: "test",
        event: "start",
      }
    })

    assert.equal(evaluated, false)
  })

  test("emits structured events and keeps logging failures non-fatal", () => {
    const info = mock.method(console, "info", () => undefined)

    traceEvent({
      traceId: "trace-abc-123",
      stage: "auth.sign_in",
      operation: "parse_body",
      subsystem: "auth",
      component: "app/api/auth/sign-in/route.ts",
      event: "start",
    })

    assert.equal(info.mock.callCount(), 1)
    assert.match(String(info.mock.calls[0].arguments[0]), /paidsoon.trace/)

    mock.restoreAll()
    mock.method(console, "info", () => {
      throw new Error("log sink failed")
    })
    mock.method(console, "warn", () => undefined)

    assert.doesNotThrow(() =>
      traceEvent({
        traceId: "trace-abc-123",
        stage: "diagnostics.failure",
        operation: "emit",
        subsystem: "diagnostics",
        component: "test",
        event: "start",
      }),
    )
  })

  test("traceOperation emits start and success with duration", async () => {
    const info = mock.method(console, "info", () => undefined)
    const context = createServerTraceContext({ traceId: "trace-abc-123", debugEnabled: true })

    const result = await traceOperation(
      context,
      {
        traceId: context.traceId,
        stage: "auth.sign_in",
        operation: "supabase.signInWithPassword",
        subsystem: "auth",
        component: "test",
      },
      async () => "ok",
      { success: () => ({ http: { status: 200 } }) },
    )

    assert.equal(result, "ok")
    assert.equal(info.mock.callCount(), 2)
    assert.match(String(info.mock.calls[1].arguments[0]), /"event":"success"/)
    assert.match(String(info.mock.calls[1].arguments[0]), /"durationMs":/)
  })
})
