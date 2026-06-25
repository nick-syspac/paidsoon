## 1. Dependencies & Environment

- [x] 1.1 Install `@marsidev/react-turnstile` package
- [x] 1.2 Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to `.env.local` using Cloudflare test keys
- [x] 1.3 Document both env vars in `docs/runbooks/README.md` env matrix (dev: test keys, production: real keys)

## 2. Turnstile Verification Helper

- [x] 2.1 Create `lib/auth/verifyTurnstile.ts` — calls Cloudflare Siteverify API with 5-second timeout, hard-fails on any error
- [x] 2.2 Create `tests/verify-turnstile.test.ts` — unit tests covering: valid token passes, missing token fails, invalid token fails, timeout returns failure

## 3. Server-Side Auth Routes

- [x] 3.1 Create `app/api/auth/sign-in/route.ts` — POST handler: validate body with Zod, call `verifyTurnstile`, call Supabase SSR `signInWithPassword`, set session cookies, return JSON response
- [x] 3.2 Create `app/api/auth/sign-up/route.ts` — POST handler: validate body with Zod, call `verifyTurnstile`, call Supabase SSR `signUp`, handle both session-live and check-email response shapes

## 4. Sign-In Page Refactor

- [x] 4.1 Add `Turnstile` widget (invisible mode) to `app/(auth)/sign-in/page.tsx` with token state tracking (`pending | ready | expired`)
- [x] 4.2 Replace direct `supabase.auth.signInWithPassword()` call with a `fetch` POST to `/api/auth/sign-in` carrying `{email, password, cfToken}`
- [x] 4.3 Disable submit button while token state is `pending`
- [x] 4.4 Handle error responses from the route (including "Security check failed" message)

## 5. Sign-Up Page Refactor

- [x] 5.1 Add `Turnstile` widget (invisible mode) to `app/(auth)/sign-up/page.tsx` with token state tracking
- [x] 5.2 Replace direct `supabase.auth.signUp()` call with a `fetch` POST to `/api/auth/sign-up` carrying `{email, password, cfToken}`
- [x] 5.3 Disable submit button while token state is `pending`
- [x] 5.4 Handle both response shapes: session-live (redirect to dashboard) and check-email (show confirmation UI)
- [x] 5.5 Handle error responses from the route (including "Security check failed" message)
