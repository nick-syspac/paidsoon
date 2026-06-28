import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { isLiveMode, shouldBlockAuthEntry } from "@/lib/liveMode"

export async function middleware(request: NextRequest) {
  const liveMode = isLiveMode()
  const { pathname } = request.nextUrl

  if (shouldBlockAuthEntry(pathname, liveMode)) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
  } = await supabase.auth.getUser()

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
        return NextResponse.json(
          { error: "Unauthenticated", code: "unauthenticated" },
          { status: 401 }
        )
      }
      const url = request.nextUrl.clone()
      url.pathname = "/sign-in"
      return NextResponse.redirect(url)
    }
    // Authenticated users pass through to the layout / route handler for role + session checks.
    return supabaseResponse
  }

  // ---------------------------------------------------------------------------
  // Dashboard route protection
  // ---------------------------------------------------------------------------

  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone()
    url.pathname = "/sign-in"
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (user && shouldBlockAuthEntry(pathname, true)) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
