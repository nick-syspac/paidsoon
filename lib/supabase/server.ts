import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { cache } from "react"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  )
}

/**
 * `supabase.auth.getUser()` makes a network round-trip to Supabase Auth to
 * validate the JWT (required — do not swap for the unvalidated `getSession()`).
 * `/dashboard` layouts/pages each called it independently, so a single
 * navigation issued it repeatedly (layout + page, sometimes more). Wrapping
 * it in React's `cache()` dedupes it to one call per request across every
 * Server Component that calls this within the same render pass.
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createClient()
  return supabase.auth.getUser()
})
