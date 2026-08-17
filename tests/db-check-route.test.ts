import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

const publishableKey = "sb_publishable_test_value"
const secretKey = "sb_secret_test_value"
let debugEnabled = true
let databaseError: Error | null = null
let databaseCalls = 0
let GET: () => Promise<Response>

type CheckResult = {
  ok: boolean
  message: string
}

type DbCheckBody = {
  ok: boolean
  checks: {
    database: CheckResult
    publishableKey: CheckResult
    secretKey: CheckResult
  }
}

describe("GET /api/diagnostics/db-check", () => {
  before(async () => {
    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          $queryRaw: async () => {
            databaseCalls += 1
            if (databaseError) throw databaseError
            return [{ result: 1 }]
          },
        },
      },
    })
    await mock.module("@/lib/diagnostics/server", {
      namedExports: {
        isDebugEnabled: () => debugEnabled,
      },
    })
    await mock.module("@/lib/config/supabaseEnvironment.server", {
      namedExports: {
        getServerSupabaseEnvironment: () => ({
          publicUrl: "https://example-project.supabase.co",
          databaseUrl: "postgresql://user:password@db.example.test:6543/postgres",
        }),
      },
    })

    ;({ GET } = await import("@/app/api/diagnostics/db-check/route"))
  })

  beforeEach(() => {
    debugEnabled = true
    databaseError = null
    databaseCalls = 0
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey
    process.env.SUPABASE_SECRET_KEY = secretKey
    mock.restoreAll()
  })

  test("reports success when the database and both API keys work", async () => {
    const requests: Array<{ url: string; apiKey: string; authorization: string | null }> = []
    mock.method(globalThis, "fetch", async (input, init) => {
      const headers = new Headers(init?.headers)
      requests.push({
        url: String(input),
        apiKey: headers.get("apikey") ?? "",
        authorization: headers.get("authorization"),
      })
      return new Response("{}", { status: 200 })
    })

    const response = await GET()
    const body = (await response.json()) as DbCheckBody
    const serializedBody = JSON.stringify(body)

    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.checks.database.ok, true)
    assert.equal(body.checks.publishableKey.ok, true)
    assert.equal(body.checks.secretKey.ok, true)
    assert.deepEqual(requests, [
      {
        url: "https://example-project.supabase.co/auth/v1/settings",
        apiKey: publishableKey,
        authorization: null,
      },
      {
        url: "https://example-project.supabase.co/auth/v1/admin/users?page=1&per_page=1",
        apiKey: secretKey,
        authorization: `Bearer ${secretKey}`,
      },
    ])
    assert.equal(serializedBody.includes(publishableKey), false)
    assert.equal(serializedBody.includes(secretKey), false)
  })

  test("fails the overall check when Supabase rejects the secret key", async () => {
    mock.method(globalThis, "fetch", async (_input, init) => {
      const key = new Headers(init?.headers).get("apikey")
      return new Response("{}", { status: key === secretKey ? 401 : 200 })
    })

    const response = await GET()
    const body = (await response.json()) as DbCheckBody

    assert.equal(body.ok, false)
    assert.equal(body.checks.publishableKey.ok, true)
    assert.equal(body.checks.secretKey.ok, false)
    assert.match(body.checks.secretKey.message, /rejected \(HTTP 401\)/)
  })

  test("reports a missing secret key without making a request for it", async () => {
    delete process.env.SUPABASE_SECRET_KEY
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async () => new Response("{}", { status: 200 })
    )

    const response = await GET()
    const body = (await response.json()) as DbCheckBody

    assert.equal(body.ok, false)
    assert.equal(body.checks.secretKey.ok, false)
    assert.match(body.checks.secretKey.message, /not configured/)
    assert.equal(fetchMock.mock.callCount(), 1)
  })

  test("keeps the endpoint hidden when debug mode is disabled", async () => {
    debugEnabled = false
    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async () => new Response("{}", { status: 200 })
    )

    const response = await GET()

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: "Not found" })
    assert.equal(databaseCalls, 0)
    assert.equal(fetchMock.mock.callCount(), 0)
  })
})