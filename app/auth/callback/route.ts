import { createClient } from "@/lib/supabase/server"
import { createUserProfile } from "@/lib/actions/auth"
import { prismaAdmin } from "@/lib/db/admin"
import { NextResponse } from "next/server"
import {
  applyTraceResponseHeaders,
  createServerTraceContext,
  traceEvent,
  traceOperation,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace, summariseErrorForTrace } from "@/lib/diagnostics/shared"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/dashboard"
  const traceContext = createServerTraceContext({
    headers: request.headers,
    cookieHeader: request.headers.get("cookie"),
  })
  const secureTraceCookie = new URL(request.url).protocol === "https:"
  warnIfProductionDebugEnabled(traceContext)

  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "auth.callback.request",
      operation: "receive_auth_callback",
      subsystem: "auth",
      component: "app/auth/callback/route.ts",
      event: "start",
      http: { method: "GET", route: "/auth/callback" },
      inputs: { codePresent: Boolean(code), nextPathPresent: Boolean(next) },
    }),
    traceContext,
  )

  if (code) {
    const supabase = await createClient()
    const { data, error } = await traceOperation(
      traceContext,
      {
        traceId: traceContext.traceId,
        stage: "auth.callback.exchange_code",
        operation: "supabase.auth.exchangeCodeForSession",
        subsystem: "auth",
        component: "app/auth/callback/route.ts",
        http: { method: "GET", route: "/auth/callback" },
        inputs: { codePresent: true },
      },
      () => supabase.auth.exchangeCodeForSession(code),
      {
        success: (result) => ({
          level: result.error ? "warn" : "info",
          event: result.error ? "failure" : "success",
          auth: summariseAuthForTrace({ user: result.data.user, session: result.data.session }),
          error: result.error ? summariseErrorForTrace(result.error) : undefined,
        }),
      },
    )
    if (!error && data.user) {
      await traceOperation(
        traceContext,
        {
          traceId: traceContext.traceId,
          stage: "auth.callback.profile_bootstrap",
          operation: "createUserProfile",
          subsystem: "auth",
          component: "app/auth/callback/route.ts",
          http: { method: "GET", route: "/auth/callback" },
          auth: summariseAuthForTrace({ user: data.user, session: data.session }),
        },
        () => createUserProfile(data.user.id),
      )
      // Route new users (trialing, onboarding not yet complete) to /onboarding.
      const profile = await traceOperation(
        traceContext,
        {
          traceId: traceContext.traceId,
          stage: "auth.callback.profile_lookup",
          operation: "prismaAdmin.userProfile.findUnique",
          subsystem: "auth",
          component: "app/auth/callback/route.ts",
          http: { method: "GET", route: "/auth/callback" },
        },
        () =>
          prismaAdmin.userProfile.findUnique({
            where: { userId: data.user.id },
            select: { subscriptionStatus: true, onboardingCompletedAt: true },
          }),
        {
          success: (result) => ({
            outputs: {
              profilePresent: Boolean(result),
              subscriptionStatus: result?.subscriptionStatus ?? null,
              onboardingCompleted: Boolean(result?.onboardingCompletedAt),
            },
          }),
        },
      )
      const isNewTrialUser =
        profile?.subscriptionStatus === "trialing" &&
        profile?.onboardingCompletedAt === null
      const redirectTo = isNewTrialUser ? "/onboarding" : next
      const response = NextResponse.redirect(`${origin}${redirectTo}`)
      applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
      traceEvent(
        () => ({
          traceId: traceContext.traceId,
          stage: "auth.callback.redirect",
          operation: "redirect_after_callback",
          subsystem: "auth",
          component: "app/auth/callback/route.ts",
          event: "decision",
          http: { method: "GET", route: "/auth/callback", status: 307 },
          navigation: { from: "/auth/callback", to: redirectTo, decision: isNewTrialUser ? "onboarding" : "next" },
        }),
        traceContext,
      )
      return response
    }
  }

  const response = NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`)
  applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      level: "warn",
      stage: "auth.callback.redirect",
      operation: "redirect_callback_failure",
      subsystem: "auth",
      component: "app/auth/callback/route.ts",
      event: "failure",
      http: { method: "GET", route: "/auth/callback", status: 307 },
      navigation: { from: "/auth/callback", to: "/sign-in?error=auth_callback_failed", decision: "auth_callback_failed" },
      inputs: { codePresent: Boolean(code) },
    }),
    traceContext,
  )
  return response
}
