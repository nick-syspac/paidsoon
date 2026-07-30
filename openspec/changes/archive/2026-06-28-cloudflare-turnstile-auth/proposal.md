## Why

The sign-in and sign-up pages accept email/password submissions directly from the browser with no bot protection, making them vulnerable to credential stuffing, brute-force attacks, and automated fake account creation. Adding Cloudflare Turnstile closes this gap with a privacy-friendly, frictionless challenge layer.

## What Changes

- **New**: Invisible Cloudflare Turnstile widget embedded on both `/sign-in` and `/sign-up` pages
- **New**: Server-side API routes `/api/auth/sign-in` and `/api/auth/sign-up` replace direct client-side Supabase auth calls
- **New**: Shared `lib/auth/verifyTurnstile.ts` helper that calls the Cloudflare Siteverify API with a 5-second timeout
- **Modified**: Sign-in and sign-up pages now POST to the new API routes (carrying the Turnstile token) rather than calling Supabase directly
- Session cookie management moves from the Supabase browser SDK to the Next.js SSR route handler
- Turnstile verification is a hard-fail: if the token is missing, invalid, or CF is unreachable, auth is blocked and a generic error is returned
- Google OAuth buttons are unaffected — they bypass Turnstile entirely
- Two new environment variables: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`

## Capabilities

### New Capabilities

- `turnstile-bot-protection`: Invisible Cloudflare Turnstile challenge on email/password auth flows (sign-in and sign-up), verified server-side before any Supabase auth call is made

### Modified Capabilities

- `auth-loading-spinner`: Sign-in/sign-up forms gain a new "bot check pending" loading state while the Turnstile token is being generated; the existing spinner applies to this state

## Impact

- **Pages**: `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx` — refactored to POST to new routes
- **New routes**: `app/api/auth/sign-in/route.ts`, `app/api/auth/sign-up/route.ts`
- **New lib**: `lib/auth/verifyTurnstile.ts`
- **New dependency**: `@marsidev/react-turnstile` (React wrapper for the Turnstile widget)
- **Env vars**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` — must be added to all environments and documented in `docs/runbooks/README.md`
- **Tests**: `tests/verify-turnstile.test.ts` for the verification helper
- No database schema changes, no Prisma changes, no billing impact
