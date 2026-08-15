import assert from "node:assert/strict"
import { before, beforeEach, mock, test } from "node:test"
import { NextRequest } from "next/server"

let mockUser: { id: string } | null = null
let proxy: typeof import("@/proxy").proxy

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost"
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test"

  await mock.module("@supabase/ssr", {
    namedExports: {
      createServerClient: () => ({
        auth: {
          getUser: async () => ({ data: { user: mockUser } }),
        },
      }),
    },
  })
  await mock.module("@/lib/liveMode", {
    namedExports: {
      isLiveMode: () => true,
      shouldBlockAuthEntry: (pathname: string, liveMode: boolean) =>
        !liveMode && (pathname === "/sign-in" || pathname === "/sign-up"),
    },
  })
  await mock.module("@/lib/diagnostics/server", {
    namedExports: {
      applyTraceResponseHeaders: () => undefined,
      createServerTraceContext: () => ({ traceId: "trace-1", debugEnabled: false }),
      traceEvent: () => undefined,
      traceOperation: async (
        _context: unknown,
        _input: unknown,
        operation: () => Promise<unknown>,
      ) => operation(),
      warnIfProductionDebugEnabled: () => undefined,
    },
  })

  ;({ proxy } = await import("@/proxy"))
})

beforeEach(() => {
  mockUser = null
})

test("redirects a dashboard request with no valid session", async () => {
  const response = await proxy(new NextRequest("http://localhost/dashboard"))

  assert.equal(response.status, 307)
  assert.equal(response.headers.get("location"), "http://localhost/sign-in")
})

test("allows a dashboard request with a verified user", async () => {
  mockUser = { id: "user-1" }

  const response = await proxy(new NextRequest("http://localhost/dashboard"))

  assert.equal(response.status, 200)
})

test("treats an expired session returned without a user as unauthenticated", async () => {
  mockUser = null

  const response = await proxy(new NextRequest("http://localhost/dashboard/invoices"))

  assert.equal(response.status, 307)
  assert.equal(response.headers.get("location"), "http://localhost/sign-in")
})

test("preserves the current live-mode sign-in behavior for a verified user", async () => {
  mockUser = { id: "user-1" }

  const response = await proxy(new NextRequest("http://localhost/sign-in"))

  assert.equal(response.status, 200)
})