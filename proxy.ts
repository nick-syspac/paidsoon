import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { isLiveMode, shouldBlockAuthEntry } from "@/lib/liveMode"
import {
  applyTraceResponseHeaders,
  createServerTraceContext,
  traceEvent,
  traceOperation,
  warnIfProductionDebugEnabled,
} from "@/lib/diagnostics/server"
import { summariseAuthForTrace } from "@/lib/diagnostics/shared"
import { getPublicSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

export async function proxy(request: NextRequest) {
  const liveMode = isLiveMode()
  const { pathname } = request.nextUrl
  const traceContext = createServerTraceContext({
    headers: request.headers,
    cookieHeader: request.headers.get("cookie"),
  })
  const secureTraceCookie = request.nextUrl.protocol === "https:"
  warnIfProductionDebugEnabled(traceContext)

  if (shouldBlockAuthEntry(pathname, liveMode)) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    const response = NextResponse.redirect(url)
    applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "proxy.auth_entry_gate",
        operation: "redirect_blocked_auth_entry",
        subsystem: "routing",
        component: "proxy.ts",
        event: "decision",
        http: { method: request.method, route: pathname, status: 307 },
        navigation: { from: pathname, to: "/", decision: "auth_entry_blocked_by_live_mode" },
        outputs: { liveMode },
      }),
      traceContext,
    )
    return response
  }

  const { publicUrl } = getPublicSupabaseEnvironment()
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const response = NextResponse.next({ request })
    applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        level: "warn",
        stage: "proxy.supabase_config",
        operation: "skip_supabase_auth_proxy",
        subsystem: "routing",
        component: "proxy.ts",
        event: "decision",
        http: { method: request.method, route: pathname },
        outputs: { supabaseUrlPresent: true, publishableKeyPresent: false },
      }),
      traceContext,
    )
    return response
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    publicUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const {
    data: { user },
  } = await traceOperation(
    traceContext,
    {
      traceId: traceContext.traceId,
      stage: "proxy.supabase_get_user",
      operation: "supabase.auth.getUser",
      subsystem: "routing",
      component: "proxy.ts",
      http: { method: request.method, route: pathname },
    },
    () => supabase.auth.getUser(),
    {
      success: (result) => ({
        auth: summariseAuthForTrace({ user: result.data.user }),
        outputs: { userPresent: Boolean(result.data.user) },
      }),
    },
  )

  // ---------------------------------------------------------------------------
  // Admin route protection (Layer 1: Supabase auth only — Edge-compatible)
  // Layers 2 (PlatformRole) and 3 (AdminSession) are enforced in route handlers
  // and the admin layout server component via lib/admin/guard.ts.
  // ---------------------------------------------------------------------------

  const isAdminApiPath = pathname.startsWith("/api/admin")
  const isAdminUiPath = pathname.startsWith("/admin")

  if (isAdminApiPath || isAdminUiPath) {
    if (!user) {
      if (isAdminApiPath) {
        const response = NextResponse.json(
          { error: "Unauthenticated", code: "unauthenticated" },
          { status: 401 }
        )
        applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
        traceEvent(
          () => ({
            traceId: traceContext.traceId,
            stage: "proxy.admin_guard",
            operation: "return_admin_api_unauthenticated",
            subsystem: "routing",
            component: "proxy.ts",
            event: "decision",
            http: { method: request.method, route: pathname, status: 401 },
            auth: summariseAuthForTrace({ user }),
            navigation: { from: pathname, decision: "admin_api_unauthenticated" },
          }),
          traceContext,
        )
        return response
      }
      const url = request.nextUrl.clone()
      url.pathname = "/sign-in"
      const response = NextResponse.redirect(url)
      applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
      traceEvent(
        () => ({
          traceId: traceContext.traceId,
          stage: "proxy.admin_guard",
          operation: "redirect_admin_unauthenticated",
          subsystem: "routing",
          component: "proxy.ts",
          event: "decision",
          http: { method: request.method, route: pathname, status: 307 },
          auth: summariseAuthForTrace({ user }),
          navigation: { from: pathname, to: "/sign-in", decision: "admin_ui_unauthenticated" },
        }),
        traceContext,
      )
      return response
    }
    // Authenticated users pass through to the layout / route handler for role + session checks.
    applyTraceResponseHeaders(supabaseResponse, traceContext, secureTraceCookie)
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "proxy.admin_guard",
        operation: "allow_admin_authenticated",
        subsystem: "routing",
        component: "proxy.ts",
        event: "decision",
        http: { method: request.method, route: pathname },
        auth: summariseAuthForTrace({ user }),
        navigation: { from: pathname, decision: "admin_auth_pass_through" },
      }),
      traceContext,
    )
    return supabaseResponse
  }

  // ---------------------------------------------------------------------------
  // Dashboard route protection
  // ---------------------------------------------------------------------------

  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone()
    url.pathname = "/sign-in"
    const response = NextResponse.redirect(url)
    applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "proxy.dashboard_guard",
        operation: "redirect_dashboard_unauthenticated",
        subsystem: "routing",
        component: "proxy.ts",
        event: "decision",
        http: { method: request.method, route: pathname, status: 307 },
        auth: summariseAuthForTrace({ user }),
        navigation: { from: pathname, to: "/sign-in", decision: "dashboard_unauthenticated" },
      }),
      traceContext,
    )
    return response
  }

  // Redirect authenticated users away from auth pages
  if (user && shouldBlockAuthEntry(pathname, true)) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    const response = NextResponse.redirect(url)
    applyTraceResponseHeaders(response, traceContext, secureTraceCookie)
    traceEvent(
      () => ({
        traceId: traceContext.traceId,
        stage: "proxy.auth_entry_gate",
        operation: "redirect_authenticated_auth_entry",
        subsystem: "routing",
        component: "proxy.ts",
        event: "decision",
        http: { method: request.method, route: pathname, status: 307 },
        auth: summariseAuthForTrace({ user }),
        navigation: { from: pathname, to: "/dashboard", decision: "authenticated_user_on_auth_page" },
      }),
      traceContext,
    )
    return response
  }

  applyTraceResponseHeaders(supabaseResponse, traceContext, secureTraceCookie)
  traceEvent(
    () => ({
      traceId: traceContext.traceId,
      stage: "proxy.pass_through",
      operation: "allow_request",
      subsystem: "routing",
      component: "proxy.ts",
      event: "decision",
      http: { method: request.method, route: pathname },
      auth: summariseAuthForTrace({ user }),
      navigation: { from: pathname, decision: "pass_through" },
    }),
    traceContext,
  )
  return supabaseResponse
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
  ],
}
