## Why

PaidSoon currently has limited end-to-end visibility into the authenticated login-to-dashboard journey, which makes failures hard to diagnose across client form handling, Supabase Auth, session cookies, protected routing, RLS-scoped data loading, and dashboard rendering. This change proposes a configurable `DEBUG` mode that adds structured diagnostic tracing for that journey without changing normal behaviour when disabled.

## Problem Statement

Authentication and first dashboard display cross several subsystems: a client sign-in form, a server route, Supabase SSR cookie handling, the Next.js proxy, dashboard server components, Prisma transactions under Supabase RLS, and client dashboard components. Today those stages do not share a consistent trace ID, timing fields, stage names, safe input summaries, or redaction rules.

When login or dashboard loading fails, operators need enough protected diagnostic context to identify the failing stage while preserving the current user-facing error behaviour and avoiding secret, credential, PII, or financial data leakage.

## Goals

- Add a server-side `DEBUG` environment variable with default `false` semantics.
- Enable detailed structured tracing only when `DEBUG` is explicitly set to the case-insensitive value `true`.
- Cover the initial journey from login submission through successful first dashboard display.
- Correlate related trace events across browser, route handler, Supabase session handling, proxy redirects, dashboard server rendering, and dashboard client completion where practical.
- Centralise debug checks, redaction, payload limits, timing, error summarisation, and trace event formatting.
- Preserve current authentication, authorisation, tenant isolation, RLS, redirect, and user-facing error behaviour.
- Document enablement, verification, retention, access, rollback, and environment-specific behaviour.

## Non-Goals

- Do not implement tracing in this change proposal.
- Do not add a new observability vendor, database table, queue, or external log sink.
- Do not expose server-only environment variables or secret configuration to browser code.
- Do not weaken Supabase Auth, Turnstile verification, dashboard route protection, RLS, or billing/plan gates.
- Do not expand initial tracing beyond login-to-dashboard, except for extension points that keep the design reusable.
- Do not show stack traces, debug payloads, or internal implementation details to ordinary users.

## Existing Login-to-Dashboard Flow

The current implementation is a Next.js App Router application using Supabase Auth via `@supabase/ssr`, Prisma, and Supabase Postgres RLS. There is no Django API or separate middleware service in this repository.

1. User submits the email/password login form in `app/(auth)/sign-in/page.tsx` through `handleEmailSignIn`.
2. Client-side validation is limited to browser input constraints: `type="email"`, `required`, disabled submit until a Turnstile token exists, and local loading/error state. There is no client Zod schema on this page.
3. The form initiates `fetch("/api/auth/sign-in", { method: "POST" })` with `{ email, password, cfToken }`.
4. `app/api/auth/sign-in/route.ts` parses JSON and validates with Zod: email, non-empty password, and non-empty Turnstile token.
5. The route creates the Supabase server client from `lib/supabase/server.ts`, then calls `supabase.auth.signInWithPassword({ email, password, options: { captchaToken: cfToken } })`. Supabase validates credentials and Turnstile using the configured provider.
6. Supabase SSR cookie handling occurs through `createServerClient`; the server client writes session cookies through the Next.js cookie store when Supabase sets them. Access tokens, refresh tokens, cookies, and complete auth responses are not exposed to application code that should log them.
7. The sign-in route returns `{ ok: true }` on success or safe 400/401 responses on invalid body or invalid credentials.
8. The client receives the response, shows a safe error and resets the Turnstile token on failure, or runs `router.push("/dashboard")` followed by `router.refresh()` on success.
9. Google sign-in uses `createClient()` from `lib/supabase/client.ts` and calls `supabase.auth.signInWithOAuth({ provider: "google", redirectTo: "<origin>/auth/callback" })`.
10. `app/auth/callback/route.ts` handles OAuth callbacks by exchanging the `code` with `supabase.auth.exchangeCodeForSession(code)`, creating a user profile via `createUserProfile(data.user.id)`, reading subscription/onboarding fields with `prismaAdmin`, and redirecting new trial users to `/onboarding` or other users to the `next` parameter defaulting to `/dashboard`.
11. `proxy.ts` runs on routed requests. It creates a Supabase server client from public Supabase env vars, calls `supabase.auth.getUser()` to refresh/read the session, redirects unauthenticated `/dashboard` requests to `/sign-in`, redirects authenticated auth-page requests to `/dashboard`, and separately guards `/admin` and `/api/admin` at the Supabase-auth layer.
12. `app/dashboard/layout.tsx` creates the server Supabase client, calls `supabase.auth.getUser()`, redirects unauthenticated users to `/sign-in`, then uses `withUserContext(user.id, ...)` to load `UserProfile` fields under RLS. It resolves subscription status, trial expiry, tier, display name, checkout redirect decisions, trial banner state, and user menu props.
13. There is no general multi-tenant organisation or membership lookup in the main dashboard path. The user context is the Supabase `user.id`; tenant isolation is enforced by `withUserContext` setting transaction-local Supabase JWT claim GUCs and `SET LOCAL ROLE authenticated` before user-scoped Prisma queries.
14. `app/dashboard/page.tsx` creates the server Supabase client, calls `supabase.auth.getUser()`, reads `searchParams`, and uses `withUserContext` to load profile, active invoice connection, and active tracked invoice count. It derives the subscription plan and feature gates with `getPlanByTier()` and `hasPlanFeature()`.
15. If permitted by feature gates, the dashboard loads tracked invoices with email logs, promises to pay, arrangement coverages, promise escalation policy, and broken-promise counts through additional `withUserContext` calls. If not permitted, it renders `LockedDashboardPreview` using `buildDashboardUpsellModel()`.
16. The initial dashboard display completes when the server-rendered dashboard shell and page content render either `InvoiceTable`, an empty state, `LockedDashboardPreview`, or redirect/upsell states. `InvoiceTable` is a client component for subsequent invoice actions, arrangement creation, local expansion/selection state, and `router.refresh()` after mutations.

## What Changes

- Add a new `diagnostic-tracing` capability for structured debug tracing.
- Define `DEBUG=false` as the default configuration and treat only `true` case-insensitively as enabled.
- Add a shared tracing abstraction that gates debug work, emits consistent structured events, measures durations, redacts sensitive values, limits payload sizes, and safely summarises errors and auth/session objects.
- Establish a correlation ID lifecycle that can link events from login submission through initial dashboard display without exposing secrets or relying on client access to server-only environment variables.
- Add trace points to the existing sign-in page, sign-in API route, OAuth callback, Supabase server/client auth boundaries, proxy dashboard auth decisions, dashboard layout, dashboard page data loaders, and initial dashboard render completion where appropriate.
- Document browser-side tracing control through a safe server-provided debug signal or route-mediated mechanism, not by exposing `DEBUG` directly as a `NEXT_PUBLIC_*` variable.
- Add tests for disabled defaults, enabled structured events, correlation IDs, redaction, safe error logging, and no behaviour changes.
- Update environment documentation for local, preview, staging, and production configuration semantics.

## Capabilities

### New Capabilities

- `diagnostic-tracing`: Configurable structured tracing for the login-to-dashboard journey, including configuration semantics, trace schema, correlation, redaction, safe error handling, performance constraints, and documentation requirements.

### Modified Capabilities

- None.

## Proposed Architecture

The implementation should introduce a small tracing module, likely under `lib/diagnostics/` or `lib/tracing/`, that exports server-safe helpers such as `isDebugEnabled()`, `createTraceContext()`, `traceOperation()`, `traceEvent()`, `redactForTrace()`, and `summariseErrorForTrace()`. Browser-facing tracing should use a separate client-safe helper and receive only an explicit, non-secret debug-enabled signal from the server or an authenticated route when needed.

Trace events should be structured JSON-compatible objects written to the existing protected runtime logs. When disabled, helpers should return quickly and avoid constructing large debug payloads. Logging failures must be swallowed after best-effort reporting so they cannot interrupt login or dashboard loading.

## Configuration Semantics

```env
DEBUG=false
```

- `DEBUG` is server-side configuration.
- Missing, empty, malformed, or unexpected values are treated as `false`.
- Only `DEBUG=true`, compared case-insensitively after trimming whitespace, enables detailed tracing.
- `DEBUG=false` and all other values disable detailed tracing.
- When disabled, normal application behaviour and existing logging remain unchanged.
- Local development can enable debug tracing by setting `DEBUG=true` in `.env.local` and restarting the Next.js dev server.
- Preview, staging, and production should set `DEBUG=false` by default in the hosting environment. Enabling tracing in deployed environments requires changing the environment variable and redeploying or restarting the runtime, depending on the host's environment-variable propagation model.
- Production enablement should produce a prominent protected server-log warning because detailed traces can be noisy and may include safe internal error context.

## Trace Event Schema

Trace events should use consistent fields, including:

- `timestamp`
- `level`
- `traceId`
- `stage`
- `operation`
- `subsystem`
- `component`
- `event`: `start`, `success`, `failure`, `decision`, or `complete`
- `durationMs` for completed operations
- `http.method`, `http.route`, and `http.status` where applicable
- `auth.state` and safe session/user summaries where applicable
- `navigation.from`, `navigation.to`, and redirect decision fields where applicable
- `tenant.userIdHash` or another safe user reference instead of raw sensitive identifiers where useful
- `inputs` and `outputs` containing redacted, size-limited safe summaries only
- `error` containing safe type, message, stack, cause chain, and third-party error summaries only when debug is enabled

## Correlation ID Lifecycle

The design should prefer a server-generated correlation ID when the login API route receives the initial request. For client-originated events, the sign-in page can request or receive a trace ID through a safe response header or dedicated non-secret cookie/header controlled by the server only when debug tracing is enabled. The ID should then be propagated through redirects and dashboard requests using a safe short-lived cookie or header that contains no secrets and is scoped to diagnostics.

OAuth flows need a parallel lifecycle because the browser leaves the application and returns through `/auth/callback`. The design should record callback trace stages using a newly generated trace ID if an existing one is unavailable, and should investigate whether a non-sensitive OAuth state extension is appropriate without weakening CSRF/state guarantees.

## Redaction and Security Design

The tracing helper must centrally redact sensitive field names at any nesting depth, including at minimum: `password`, `pass`, `token`, `access_token`, `refresh_token`, `id_token`, `session`, `cookie`, `cookies`, `authorization`, `auth`, `apiKey`, `api_key`, `secret`, `clientSecret`, `databaseUrl`, `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `cfToken`, and Turnstile response fields.

Auth and session objects should be logged only as safe summaries, such as whether a user exists, provider when available, safe hashed user reference, cookie/session presence booleans, expiry presence, and error code/message when safe. Request and response bodies should be omitted by default or logged as allowlisted summaries with a maximum payload length. Redaction must traverse nested arrays and objects, truncate long values, handle circular references safely, and protect against third-party errors containing embedded request config, headers, or tokens.

Debug mode must not log passwords, access tokens, refresh tokens, session cookies, authorization headers, API keys, database credentials, Supabase service-role or secret keys, complete authentication responses, or unnecessary personal/financial information such as client email, client name, raw invoice rows, payment URLs, or amounts unless an explicit safe aggregate is needed for diagnosis.

## Error-Handling Design

When debug mode is enabled, protected server logs should capture the failed login-to-dashboard stage, safe context, error type, message, stack, and cause chain where available. User-facing responses must remain safe: invalid login still returns a generic invalid-credentials message, malformed input still returns validation output, dashboard redirects remain unchanged, and ordinary users never see internal stack traces.

Tracing failures must not throw into application control flow. If the logging sink itself fails, helpers should degrade silently or emit one safe fallback error without interrupting authentication or rendering.

## Files or Modules Likely to Change

- `lib/diagnostics/*` or `lib/tracing/*` for shared tracing, redaction, and configuration helpers.
- `app/(auth)/sign-in/page.tsx` for login submission and initial navigation trace points if browser-side tracing is required.
- `app/api/auth/sign-in/route.ts` for validation, Supabase password sign-in, response, and correlation setup tracing.
- `app/auth/callback/route.ts` for OAuth callback exchange, profile bootstrap, onboarding/dashboard redirect tracing.
- `proxy.ts` for session refresh/getUser, dashboard guard, admin guard, and redirect decision tracing.
- `lib/supabase/server.ts` and `lib/supabase/client.ts` only if helper boundaries are needed for safe auth/session summaries.
- `app/dashboard/layout.tsx` for authenticated shell, profile/tier/trial loading, and redirect decision tracing.
- `app/dashboard/page.tsx` for dashboard data-loading, feature-gate, invoice query, and rendered-state tracing.
- `components/dashboard/InvoiceTable.tsx` or a small dashboard display marker component if client-side initial display completion must be recorded.
- `docs/runbooks/README.md` for `DEBUG` environment variable documentation.
- `tests/` for unit and route-level tests around tracing, redaction, and behaviour preservation.

## Testing Strategy

- Unit tests for `isDebugEnabled()` covering unset, empty, malformed, `false`, mixed-case `true`, and whitespace.
- Unit tests for redaction of nested sensitive keys, arrays, errors, request-like objects, headers, and maximum length truncation.
- Unit tests for trace event formatting, duration measurement, error cause-chain summarisation, and logging failure isolation.
- Route-level tests for `/api/auth/sign-in` verifying no detailed tracing when disabled, structured events when enabled, safe invalid-credentials logging, and no password/Turnstile token leakage.
- Tests for dashboard data-load tracing boundaries using mocked Supabase/Prisma helpers or extracted pure functions where possible.
- End-to-end or Playwright-style acceptance tests, if available in the project, should verify login-to-dashboard correlation and absence of debug details in the UI. If no E2E harness exists, add implementation tasks to investigate or document the manual verification path.

## Deployment and Rollback Considerations

- Local: update `.env.local` to `DEBUG=true` for diagnostics, restart the dev server, then restore or unset it.
- Preview/staging: set `DEBUG=true` only for targeted troubleshooting, redeploy or restart as required, inspect protected platform logs, and revert to `DEBUG=false` immediately after capture.
- Production: keep `DEBUG=false` by default. Temporary production enablement should be approved, time-boxed, accompanied by a prominent protected warning, and followed by redeploy/restart back to disabled mode.
- Rollback is configuration-first: set `DEBUG=false` or remove the variable and redeploy/restart. Code rollback should be unnecessary if helpers are no-op when disabled.
- Logs are retained and accessed through the hosting/runtime logging system already used by PaidSoon. Removal follows the provider's log retention controls; this proposal does not add persistent application storage for trace events.

## Risks and Mitigations

- Secret leakage risk: mitigate with central nested redaction, allowlisted auth summaries, payload limits, and redaction tests.
- PII/financial data leakage risk: avoid logging raw invoice/customer data and prefer counts, statuses, and safe aggregates.
- Performance overhead risk: make disabled checks cheap and avoid constructing payloads unless debug is enabled.
- Noise risk: trace only major operations and add controls for repeated render/auth callback events.
- Behaviour regression risk: keep tracing side-effect free, swallow logging failures, and test disabled/default behaviour.
- Browser exposure risk: do not use `NEXT_PUBLIC_DEBUG`; use server-mediated, non-secret debug state only where client tracing is truly required.

## Future Extension Points

- Extend the same tracing helper to billing checkout, Stripe Connect, accounting provider sync, email automation, and admin diagnostics after the login-to-dashboard flow is complete.
- Add log-level filtering, sampled tracing, or provider-specific adapters if operational needs outgrow console/platform logs.
- Add richer dashboard client hydration/render markers if the project later adopts a formal browser observability pipeline.
