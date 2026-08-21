## Context

PaidSoon is a Next.js App Router application. The login-to-dashboard path uses a client sign-in page, a server sign-in route, Supabase Auth via `@supabase/ssr`, `proxy.ts` for protected route decisions, dashboard server components for authenticated data loading, Prisma, and Supabase Postgres RLS through `withUserContext()`.

The current email/password login flow starts in `app/(auth)/sign-in/page.tsx`, posts to `app/api/auth/sign-in/route.ts`, calls `supabase.auth.signInWithPassword()`, and navigates to `/dashboard` after a successful safe response. OAuth login calls browser Supabase `signInWithOAuth()` and returns through `app/auth/callback/route.ts`, where the code is exchanged for a session, a profile is bootstrapped, and the user is redirected to `/onboarding` or `/dashboard`.

Dashboard access is then checked by `proxy.ts` and by `app/dashboard/layout.tsx` / `app/dashboard/page.tsx`, each of which calls `supabase.auth.getUser()`. User-scoped data loading uses `withUserContext(user.id, ...)`, which sets transaction-local JWT claims and `SET LOCAL ROLE authenticated` so RLS policies apply. The main dashboard path does not currently load a separate tenant, organisation, membership, or role model; the user ID and subscription profile drive the dashboard context and feature gates.

The tracing design must respect existing security rules: no secrets in source, no service credentials in browser code, no user-facing stack traces, no raw customer invoice data in logs, and no bypassing RLS or authentication controls.

## Goals / Non-Goals

**Goals:**

- Provide a shared, side-effect-free tracing abstraction for the login-to-dashboard flow.
- Make `DEBUG` disabled by default and enabled only by explicit case-insensitive `true`.
- Emit consistent structured trace events with operation names, subsystems, stage names, outcomes, durations, HTTP metadata, redirect decisions, auth/session summaries, safe context, and trace IDs.
- Redact sensitive values centrally at any nesting depth and limit logged payload size.
- Allow browser-side trace events only through a secure, non-secret control mechanism.
- Preserve existing user-facing errors, redirects, auth/session behaviour, RLS, and dashboard rendering.

**Non-Goals:**

- Add persistent database storage for trace events.
- Add a third-party logging or tracing dependency.
- Add tracing to unrelated flows such as billing, accounting sync, email automation, or admin diagnostics in the initial implementation.
- Make debug mode available through a public `NEXT_PUBLIC_DEBUG` variable.
- Use tracing as a feature flag for behaviour changes.

## Decisions

### Decision: Use a server-first tracing helper with cheap disabled checks

Create a small module such as `lib/diagnostics/tracing.ts` and related helpers for configuration, redaction, and error summaries. The main entry points should check `isDebugEnabled()` before constructing expensive event payloads.

Rationale: Most trace points are in server routes, proxy, and server components. A server-first helper keeps `DEBUG` private and avoids duplicating redaction logic.

Alternatives considered:

- Inline `if (process.env.DEBUG)` checks at each call site. Rejected because redaction, formatting, duration timing, and correlation would drift.
- Add an external tracing package. Rejected for the initial scope because existing platform logs are sufficient and a new dependency increases operational surface.

### Decision: Treat `DEBUG` as server-only configuration

`DEBUG` must not be renamed to or mirrored as `NEXT_PUBLIC_DEBUG`. Browser-side tracing, if implemented, should be enabled only when the server has determined debug mode is active and has issued a non-secret diagnostic control value, such as a short-lived trace cookie or response header.

Rationale: Server-only environment variables and deployment settings must not be exposed to the browser. The browser only needs to know whether to emit a small set of safe trace markers, not why debug mode is enabled or what other server configuration exists.

Alternatives considered:

- Use `NEXT_PUBLIC_DEBUG`. Rejected because it exposes an operational flag globally and can become a precedent for exposing server configuration.
- Omit browser tracing entirely. Viable if implementation can cover initial display using server-rendered completion events, but the sign-in submission and client navigation stages benefit from safe browser markers. The task list includes an investigation step to decide the minimum needed browser surface.

### Decision: Use structured console/platform logs as the initial sink

Trace events should be emitted as structured JSON-compatible objects to the existing protected runtime logging path, likely `console.info` / `console.warn` / `console.error` depending on event level.

Rationale: PaidSoon already relies on platform logs for runtime diagnostics. Avoiding new storage also avoids retention, access-control, and deletion complexity inside the application.

Alternatives considered:

- Persist traces in Postgres. Rejected for initial scope because it introduces schema, RLS, retention, and cleanup requirements.
- Send traces to a vendor. Rejected because the request does not require external observability and no approved vendor is present.

### Decision: Propagate a diagnostic trace ID with a short-lived non-secret mechanism

The sign-in route should generate or accept a safe trace ID and return/propagate it through a response header or short-lived diagnostic cookie when debug tracing is enabled. Dashboard requests can read that value and include it in server-side trace events. OAuth callback can start a new trace if no safe correlation value exists and should investigate whether extending OAuth state is appropriate without weakening Supabase's state handling.

Rationale: The trace ID needs to connect events across client fetch, route handler, proxy, redirects, server components, and initial render. It must not contain user identifiers or secrets.

Alternatives considered:

- Store trace IDs in localStorage. Rejected because cookies/headers fit server-rendered requests better and localStorage is less useful to server components.
- Put raw user IDs in trace IDs. Rejected because trace IDs must be non-sensitive and safe to log.

### Decision: Redact by denylisted sensitive names plus allowlisted summaries

The redactor should recursively redact sensitive keys at any depth and truncate long values. Auth/session/request objects should generally be logged through explicit summary functions rather than generic object logging.

Rationale: Generic auth responses can contain tokens, cookies, headers, provider metadata, and nested request config. Safe summaries reduce the chance of accidental leakage.

Alternatives considered:

- Rely on developers to choose safe fields manually. Rejected because the tracing system is cross-cutting and will be edited over time.
- Redact only top-level keys. Rejected because secrets often appear nested in headers, causes, provider responses, or error config.

### Decision: Keep trace failures non-fatal

All trace emission should be best-effort. Helpers must catch logging/redaction errors and never throw into login, auth callback, proxy, or dashboard rendering control flow.

Rationale: Diagnostics must not become an availability dependency.

Alternatives considered:

- Fail closed when tracing cannot log. Rejected because the feature is diagnostic only and must not block authentication or dashboard access.

## Trace Coverage Plan

- `app/(auth)/sign-in/page.tsx`: trace email sign-in submit start, client fetch start/finish, safe failure reason category, successful navigation start, and optional dashboard display marker. Trace Google OAuth initiation with provider and redirect target origin only.
- `app/api/auth/sign-in/route.ts`: trace body parse, Zod validation, Supabase password sign-in start/finish, safe auth failure, success response, HTTP status, and duration.
- `app/auth/callback/route.ts`: trace code presence, exchange start/finish, profile bootstrap, onboarding/profile lookup, redirect decision, and failure redirect.
- `proxy.ts`: trace Supabase getUser start/finish, session/user presence, dashboard/admin/auth-page redirect decisions, and pass-through decisions.
- `app/dashboard/layout.tsx`: trace getUser, profile load under `withUserContext`, tier/trial calculation, checkout redirect decision, and layout render completion.
- `app/dashboard/page.tsx`: trace search param interpretation, initial profile/connection/count load, feature gate decisions, invoice/policy/broken-promise data loads, empty/locked/table render decision, and page render completion.
- `withUserContext()`: optionally trace RLS context setup as a reusable operation, but avoid logging raw user IDs or query results.

## Redaction Details

The redaction module should:

- Redact keys case-insensitively where practical.
- Match exact sensitive names and common variants containing `token`, `password`, `secret`, `authorization`, `cookie`, `apiKey`, `databaseUrl`, and configured service key names.
- Traverse nested objects and arrays with a maximum depth.
- Detect circular references.
- Truncate strings and serialised payloads to a defined maximum length.
- Summarise `Error` objects with safe `name`, `message`, `stack`, and recursive `cause`, then pass the result through redaction.
- Avoid logging request/response bodies except for explicitly allowlisted summaries.

## Migration Plan

1. Add tracing helper modules and tests while leaving all call sites untouched.
2. Add server-side trace points to the sign-in route and auth callback.
3. Add proxy and dashboard server component trace points.
4. Add the minimal client-safe tracing surface if investigation confirms it is needed for login submission/navigation/display markers.
5. Update runbook documentation for `DEBUG`.
6. Validate default-disabled behaviour and enabled trace coverage.

Rollback is configuration-first: unset `DEBUG` or set it to `false`, then redeploy/restart if required by the environment. If a code rollback is needed, removing trace calls should not require schema or data migration because no persistent trace storage is introduced.

## Environment Behaviour

- Local development reads `.env.local`; changing `DEBUG` requires restarting the dev server.
- Vercel preview/staging/production read environment variables at build/runtime according to the deployment platform. Operators should redeploy or restart after changes to ensure all serverless/edge contexts see the new value.
- Browser bundles must not directly depend on `process.env.DEBUG`; otherwise changing debug mode could require rebuilds and expose server configuration.
- Production `DEBUG=true` should emit a prominent protected warning at startup or first trace use, including that debug tracing is temporary and must be disabled after diagnosis.

## Risks / Trade-offs

- Secret leakage -> Central redaction, auth/session summaries, denylisted keys, payload limits, and tests for nested sensitive values.
- PII leakage -> Do not log raw invoice/customer data; use counts, statuses, route names, and safe aggregates.
- Performance overhead -> Fast disabled guard; lazy payload builders; avoid trace points in render loops or repeated callbacks.
- Log noise -> Trace major operations only; add repeated-event controls for browser display markers and auth callbacks.
- Edge/runtime differences -> Keep proxy-compatible code lightweight and avoid Node-only APIs in `proxy.ts` helpers.
- Correlation gaps in OAuth -> Generate callback traces even when prior correlation is unavailable; investigate safe state/cookie propagation before implementation.
- False sense of tenant tracing -> Document that main dashboard tenant context is currently user/RLS based, not organisation/membership based.

## Open Questions

- Should the initial dashboard display completion be recorded by a tiny client marker component, or is server render completion sufficient for the first implementation?
- Should OAuth correlation reuse a short-lived diagnostic cookie, a safe state extension, or start a new callback trace when returning from Supabase/Google?
- What exact maximum payload length should be used: 2 KB per field and 16 KB per event, or a stricter limit?
- Should production warning emission happen once per process/request lifecycle, or on every enabled trace in production-like environments?
