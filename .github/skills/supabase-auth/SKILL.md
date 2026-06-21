# Skill: Supabase Auth — PaidSoon

## When to Use This Skill
Use when implementing or debugging authentication flows, session management, OAuth callbacks, or the pre-launch gate in PaidSoon.

## Status
Confirmed implemented in this codebase (Supabase Auth via `@supabase/ssr@0.10.3`).

## Inputs Required
- Auth flow being implemented (sign-in, sign-up, OAuth, callback, sign-out)
- Whether this is server-side or client-side context

## Files to Inspect
- `lib/supabase/server.ts` — server client factory
- `lib/supabase/client.ts` — browser client factory
- `middleware.ts` — session refresh + auth gate
- `app/auth/callback/route.ts` — OAuth code exchange
- `app/auth/sign-out/route.ts` — sign-out handler
- `app/(auth)/sign-in/page.tsx` — sign-in page
- `lib/liveMode.ts` — pre-launch gate

## Rules to Follow

### Client Selection
| Context | Import |
|---|---|
| Server Component / Route Handler | `createClient` from `lib/supabase/server.ts` |
| Client Component | `createClient` from `lib/supabase/client.ts` |

### Auth Identity
```ts
// Always use getUser() on server — not getSession()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
```

### OAuth Callback
- Route: `app/auth/callback/route.ts`
- Exchanges `code` query param for session via `supabase.auth.exchangeCodeForSession(code)`
- Redirects to `/dashboard` on success

### Sign-out
- Route: `app/auth/sign-out/route.ts`
- Calls `supabase.auth.signOut()`
- Redirects to `/` (homepage) — never to a user-supplied URL

### Pre-launch Gate
- `isLiveMode()` returns `false` when `LIVE` env var is not `"true"`
- When not live, `shouldBlockAuthEntry()` redirects sign-in/sign-up paths to `/`
- Set `LIVE=true` in production Vercel environment

### Post-signup Bootstrap
- `lib/actions/auth.ts` creates `UserProfile` + `Schedule` via `prismaAdmin` on first sign-in
- This is the only approved use of `prismaAdmin` for user creation

## Common Mistakes to Avoid
- Using browser client (`lib/supabase/client.ts`) in server components or route handlers
- Using `getSession()` instead of `getUser()` for server-side auth
- Redirecting to a user-provided URL after sign-out (open redirect risk)
- Forgetting to set `LIVE=true` in production
- Calling `createClient()` without `await` (it is async on the server)

## Output Format
- Auth-related code in appropriate file (`lib/supabase/`, `app/auth/`, middleware)
- Correct error responses (401 on auth failure)
- No sensitive user data exposed in response bodies

## Acceptance Checklist
- [ ] Server components use `lib/supabase/server.ts`
- [ ] Client components use `lib/supabase/client.ts`
- [ ] `getUser()` used (not `getSession()`) in route handlers
- [ ] Sign-out redirects to `/`
- [ ] `LIVE` mode gate respected in middleware
- [ ] No open redirect vulnerabilities
