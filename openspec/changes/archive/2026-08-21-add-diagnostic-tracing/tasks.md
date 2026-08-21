## 1. Investigation and Scope Confirmation

- [x] 1.1 Confirm whether initial dashboard display completion requires a browser marker component or can be represented by server render completion events.
- [x] 1.2 Confirm the safest OAuth correlation approach: short-lived diagnostic cookie, safe state extension, or new callback trace when prior correlation is unavailable.
- [x] 1.3 Choose concrete payload limits for trace fields and full events, and document the rationale in the implementation notes.
- [x] 1.4 Identify which runtime environments are considered production-like for prominent `DEBUG=true` warnings.

## 2. Core Tracing Helpers

- [x] 2.1 Add a server-side debug configuration helper that enables tracing only when `DEBUG` trims to case-insensitive `true`.
- [x] 2.2 Add trace context and correlation ID helpers that generate non-secret IDs and propagate them through safe headers or short-lived diagnostic cookies.
- [x] 2.3 Add a structured trace event formatter with fields for timestamp, level, trace ID, stage, operation, subsystem, component, event type, duration, HTTP metadata, navigation decisions, auth summaries, safe inputs, safe outputs, and errors.
- [x] 2.4 Add a `traceOperation()` helper that emits start/success/failure events, measures duration, and avoids expensive payload construction when disabled.
- [x] 2.5 Ensure all tracing helpers catch logging, formatting, and redaction failures without interrupting application flow.

## 3. Redaction and Safe Summaries

- [x] 3.1 Implement central recursive redaction for sensitive field names including passwords, tokens, sessions, cookies, authorization headers, API keys, service keys, database URLs, Turnstile tokens, and secret variants.
- [x] 3.2 Add depth limits, circular-reference protection, and maximum string/payload truncation.
- [x] 3.3 Add safe auth/session summary helpers that report user/session presence and non-sensitive state without logging raw Supabase auth responses.
- [x] 3.4 Add safe error summary helpers for error type, message, stack, cause chain, and third-party error objects after redaction.
- [x] 3.5 Add production-like `DEBUG=true` warning emission without exposing sensitive configuration.

## 4. Server-Side Trace Points

- [x] 4.1 Add trace events to `app/api/auth/sign-in/route.ts` for JSON parse, Zod validation, Supabase password sign-in, safe failure, success response, HTTP status, duration, and correlation setup.
- [x] 4.2 Add trace events to `app/auth/callback/route.ts` for code presence, session exchange, user profile bootstrap, profile lookup, onboarding/dashboard redirect decision, and failure redirect.
- [x] 4.3 Add proxy-compatible trace events to `proxy.ts` for Supabase `getUser()`, dashboard/admin/auth-page guard decisions, redirects, pass-through outcomes, and safe session state summaries.
- [x] 4.4 Add trace events to `app/dashboard/layout.tsx` for `getUser()`, RLS-scoped profile load, subscription/trial/tier decisions, checkout redirect decision, and layout render completion.
- [x] 4.5 Add trace events to `app/dashboard/page.tsx` for search parameter interpretation, profile/connection/count loading, plan feature gate decisions, invoice/policy/broken-promise data loads, rendered-state decision, and page render completion.
- [x] 4.6 Evaluate whether `withUserContext()` should emit a safe RLS-context setup trace and add it only if it does not expose raw user IDs or query results.

## 5. Client-Safe Trace Points

- [x] 5.1 Add a client-safe tracing helper that cannot read server-only environment variables and emits browser markers only when the server has provided a non-secret debug signal.
- [x] 5.2 Add sign-in page trace markers for email login submit, fetch start/finish, safe failure category, successful navigation to `/dashboard`, and Google OAuth initiation if browser tracing is confirmed necessary.
- [x] 5.3 Add a one-time dashboard initial display marker only if investigation confirms server render completion is insufficient.
- [x] 5.4 Ensure browser-side trace payloads never include passwords, Turnstile tokens, cookies, auth responses, invoice rows, or customer/financial details.

## 6. Tests

- [x] 6.1 Add unit tests for debug configuration semantics covering unset, empty, malformed, `false`, `true`, mixed case, and whitespace.
- [x] 6.2 Add unit tests for redaction of nested sensitive keys, arrays, headers, request-like objects, errors, cause chains, circular references, and truncation.
- [x] 6.3 Add unit tests for trace event formatting, duration measurement, correlation IDs, safe auth/session summaries, safe error summaries, and non-fatal logging failures.
- [x] 6.4 Add route-level tests for `/api/auth/sign-in` verifying disabled no-op behaviour, enabled structured events, safe invalid-credentials diagnostics, and mandatory redaction.
- [x] 6.5 Add dashboard tracing tests using extracted helpers or mocks to verify stage names, feature-gate decisions, data-load failure diagnostics, and no raw invoice/customer data leakage.
- [x] 6.6 Add or document an end-to-end/manual verification path for successful login-to-dashboard correlation if no existing E2E harness supports it.
- [x] 6.7 Run the relevant focused tests and then the project test suite.

## 7. Documentation and Deployment

- [x] 7.1 Update `docs/runbooks/README.md` with `DEBUG`, scope, purpose, local/preview/staging/production guidance, default `false`, and redeploy/restart requirements.
- [x] 7.2 Document how operators enable, verify, access, retain, and remove debug logs without including secrets.
- [x] 7.3 Document production-use warnings, rollback steps, and the rule that debug mode must not change auth, authorisation, tenant isolation, RLS, or user-facing errors.
- [x] 7.4 Confirm no implementation uses `NEXT_PUBLIC_DEBUG` or otherwise exposes server-only debug configuration to browser bundles.

## 8. Acceptance Verification

- [x] 8.1 Verify `DEBUG` unset and `DEBUG=false` preserve current login and dashboard behaviour.
- [x] 8.2 Verify `DEBUG=true` emits structured trace events for successful email login through initial dashboard display.
- [x] 8.3 Verify authentication failures and dashboard-loading failures log protected diagnostic details while users receive safe existing errors.
- [x] 8.4 Verify passwords, tokens, cookies, credentials, protected headers, API keys, session data, and unnecessary customer/financial data do not appear in emitted logs.
- [x] 8.5 Verify logging failures do not break login, callback, proxy, or dashboard rendering flows.
