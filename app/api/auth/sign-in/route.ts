import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  applyTraceResponseHeaders,
  createServerTraceContext,
  traceEvent,
  traceOperation,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseErrorForTrace } from "@/lib/diagnostics/shared"

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  cfToken: z.string().min(1),
})

export async function POST(request: Request) {
  const traceContext = createServerTraceContext({
    headers: request.headers,
    cookieHeader: request.headers.get("cookie"),
  })
  const secureTraceCookie = new URL(request.url).protocol === "https:"
  warnIfProductionDebugEnabled(traceContext)

  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "auth.sign_in.request",
      operation: "receive_sign_in_request",
      subsystem: "auth",
      component: "app/api/auth/sign-in/route.ts",
      event: "start",
      http: { method: "POST", route: "/api/auth/sign-in" },
    }),
    traceContext,
  )

  let body: unknown
  try {
    body = await traceOperation(
      traceContext,
      {
        traceId: traceContext.traceId,
        stage: "auth.sign_in.parse_body",
        operation: "request.json",
        subsystem: "auth",
        component: "app/api/auth/sign-in/route.ts",
        http: { method: "POST", route: "/api/auth/sign-in" },
      },
      () => request.json(),
    )
  } catch (error) {
    const response = NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        level: "warn",
        stage: "auth.sign_in.parse_body",
        operation: "return_invalid_body",
        subsystem: "auth",
        component: "app/api/auth/sign-in/route.ts",
        event: "failure",
        http: { method: "POST", route: "/api/auth/sign-in", status: 400 },
        error: summariseErrorForTrace(error),
      }),
      traceContext,
    )
    return response
  }

  const parsed = signInSchema.safeParse(body)
  if (!parsed.success) {
    const response = NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        level: "warn",
        stage: "auth.sign_in.validation",
        operation: "validate_sign_in_payload",
        subsystem: "auth",
        component: "app/api/auth/sign-in/route.ts",
        event: "failure",
        http: { method: "POST", route: "/api/auth/sign-in", status: 400 },
        inputs: {
          hasEmail: typeof body === "object" && body !== null && "email" in body,
          hasCredential: typeof body === "object" && body !== null && "password" in body,
          hasCaptcha: typeof body === "object" && body !== null && "cfToken" in body,
        },
        error: parsed.error.flatten(),
      }),
      traceContext,
    )
    return response
  }

  const { email, password, cfToken } = parsed.data

  const supabase = await createClient()
  // captchaToken is verified by Supabase against the configured Turnstile provider
  const { error } = await traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "auth.sign_in.supabase_password",
      operation: "supabase.auth.signInWithPassword",
      subsystem: "auth",
      component: "app/api/auth/sign-in/route.ts",
      http: { method: "POST", route: "/api/auth/sign-in" },
      inputs: {
        emailPresent: Boolean(email),
        credentialProvided: Boolean(password),
        captchaProvided: Boolean(cfToken),
      },
    },
    () =>
      supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken: cfToken },
      }),
    {
      success: (result) => ({
        level: result.error ? "warn" : "info",
        event: result.error ? "failure" : "success",
        http: { method: "POST", route: "/api/auth/sign-in", status: result.error ? 401 : 200 },
        outputs: { signInAccepted: !result.error, sessionCookieHandledBySupabaseSsr: !result.error },
        error: result.error ? summariseErrorForTrace(result.error) : undefined,
      }),
    },
  )

  if (error) {
    const response = NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
    return response
  }

  const response = NextResponse.json({ ok: true })
  applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "auth.sign_in.response",
      operation: "return_success",
      subsystem: "auth",
      component: "app/api/auth/sign-in/route.ts",
      event: "success",
      http: { method: "POST", route: "/api/auth/sign-in", status: 200 },
      outputs: { ok: true },
    }),
    traceContext,
  )
  return response
}
