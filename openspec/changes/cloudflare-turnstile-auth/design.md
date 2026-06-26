## Context

Both auth pages are `"use client"` components that call the Supabase browser SDK directly (`supabase.auth.signInWithPassword`, `supabase.auth.signUp`). There is no intermediate server step, so there is currently no place to insert server-side bot verification.

Cloudflare Turnstile issues a one-time browser token via a JS widget. That token must be verified against Cloudflare's Siteverify API from a server — it cannot be verified client-side. This requires introducing a server boundary in the auth flow.

The existing `lib/supabase/server.ts` SSR client writes session cookies via Next.js's `cookies()` API, which is accessible from route handlers. This means Supabase's session management can be moved server-side without losing cookie-based session continuity.

## Goals / Non-Goals

**Goals:**
- Verify a valid Turnstile token before any Supabase auth call is made
- Hard-fail (block auth, return error) if the token is missing, invalid, or Cloudflare is unreachable
- Keep the email/password auth flow functionally identical from the user's perspective
- Invisible widget mode — no visible CAPTCHA UI for normal users

**Non-Goals:**
- Protecting Google OAuth sign-in/sign-up (Google handles its own bot detection)
- Rate limiting beyond what Cloudflare Turnstile and Supabase already provide
- Turnstile on any routes other than sign-in and sign-up
- Supabase Auth Hooks (requires Supabase Pro, out of scope)

## Decisions

### D1 — Server-mediated auth via new API routes

**Decision**: Introduce `/api/auth/sign-in` and `/api/auth/sign-up` POST handlers. The client POSTs `{email, password, cfToken}` to these routes. The route verifies the token, then calls Supabase server-side.

**Rationale**: Verification must be server-side. The cleanest boundary is a dedicated route handler — it keeps concerns separated, is independently testable, and does not complicate the existing middleware or SSR patterns.

**Alternative considered**: Verify-then-proceed (client verifies via a separate `/api/auth/verify-turnstile` endpoint, then calls Supabase directly). Rejected because verification and auth are decoupled — a bot that passes verification could race the auth call. Also leaves a TOCTOU window even if small.

**Alternative considered**: Supabase Auth Hook. Requires Supabase Pro plan. Too much infrastructure complexity for this change.

### D2 — `@marsidev/react-turnstile` for widget integration

**Decision**: Use the `@marsidev/react-turnstile` npm package rather than manually loading Cloudflare's script.

**Rationale**: Handles script injection, widget lifecycle (mount/unmount), token expiry callbacks, and TypeScript types. Eliminates `window.turnstile` global usage in components. Lightweight (~8KB).

**Alternative considered**: Manual `<Script src="..." />` with `window.turnstile`. Works but requires manual lifecycle management and `useEffect` wiring. No benefit over the wrapper.

### D3 — Hard-fail on Cloudflare Siteverify error

**Decision**: If the Cloudflare Siteverify API call fails for any reason (timeout, network error, invalid token, CF outage), return a 503 with the message "Security check failed. Please try again." No auth attempt is made.

**Rationale**: Consistency and security. Soft-fail (letting auth through if CF is down) defeats the purpose of the protection layer. The 5-second timeout is generous for an API call that normally resolves in <100ms. Real users can simply retry; the error message is actionable.

### D4 — Token expiry handling on the client

**Decision**: Track Turnstile token state (`pending | ready | expired`) in component state. Disable the submit button while `pending`. On `expired`, the widget auto-refreshes and re-issues a callback — no manual reset needed.

**Rationale**: Invisible mode pre-generates the token on page load. For most users the token is ready before they finish typing. Disabling submit during `pending` prevents the edge case of a user submitting before the widget has resolved.

### D5 — Session cookie management stays with Supabase SSR client

**Decision**: The new route handlers use `createClient()` from `lib/supabase/server.ts` to call `signInWithPassword` / `signUp`. This client writes session cookies via the Next.js cookie API on the response.

**Rationale**: Maintains consistency with the rest of the app (middleware, dashboard routes all expect cookies set by the Supabase SSR client). No custom session handling needed.

## Risks / Trade-offs

- **Cloudflare dependency on critical path** → Mitigated by 5-second timeout and a clear, actionable error message. CF's uptime SLA is >99.9%.
- **Token lifetime (5 minutes)** → If a user leaves a form open for >5 minutes, the token expires. The widget auto-refreshes silently in invisible mode, so submit will briefly re-disable then re-enable. Unlikely to cause user confusion.
- **Google OAuth unprotected by Turnstile** → Acceptable. Google's OAuth flow already includes its own bot protection. Scope is intentionally limited to email/password.
- **Route handler session cookies vs. browser SDK** → The Supabase SSR `createClient` in route handlers writes cookies correctly when the `NextResponse` is constructed before the Supabase client. Care is needed in implementation — the response object must be passed to the cookie setter, not created after.

## Migration Plan

1. Add `@marsidev/react-turnstile` to dependencies
2. Add env vars (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) to all environments using Cloudflare test keys in dev/preview, real keys in production
3. Create `lib/auth/verifyTurnstile.ts` and its test
4. Create `/api/auth/sign-in` and `/api/auth/sign-up` route handlers
5. Refactor sign-in and sign-up page components to POST to new routes
6. Update `docs/runbooks/README.md` with new env vars

No database migrations. No Stripe or billing changes. Rollback is straightforward — revert the page components to direct Supabase calls and remove the new routes.

## Open Questions

- None. All decisions made during exploration.
