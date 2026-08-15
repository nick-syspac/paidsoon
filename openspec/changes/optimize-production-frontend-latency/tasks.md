# Optimize Production Frontend Latency Tasks

## 1. Repository State and Baseline

- [x] 1.1 Re-read repository instructions that apply to every touched file, inspect Git status, preserve unrelated changes, and record the Node/npm, Next.js, Vercel, Supabase, Prisma, test, build, and deployment setup used for this change.
- [x] 1.2 Run `npm run lint`, `npx tsc --noEmit`, `npm run test`, and `npm run build` before runtime edits; record pass/fail status, duration, build warnings, static versus dynamic route output, available route/chunk sizes, and any unusually large dependency evidence without inventing a missing package script.
- [x] 1.3 Trace one signed-in dashboard request through proxy matching, session refresh/validation, application auth, profile/tenant context, RLS transaction setup, page loaders, database queries, rendering, hydration, and browser follow-up requests; record a concise sequential/parallel latency map and operation/query counts from existing diagnostics.
- [x] 1.4 Inspect global layouts/providers, client boundaries, route handlers/actions, fonts, images, analytics/third-party scripts, dynamic rendering triggers, cache/revalidation directives, proxy matcher scope, Prisma initialization, and likely Vercel-to-Supabase network boundaries; distinguish confirmed causes from unmeasured risks.
- [x] 1.5 Capture repeatable production-mode browser baseline measurements for direct dashboard load and client navigation when a safe URL/account is available, including TTFB, FCP, LCP, INP or an explicitly named interaction proxy, useful dashboard render, requests, transferred JavaScript, hydration, and slowest requests; otherwise capture the supported local production subset and mark unavailable metrics.

## 2. Performance and Security Test Harness

- [x] 2.1 Add focused deterministic tests or trace assertions that count application-render verified-auth, profile/context, RLS transaction, overview-loader, and browser follow-up operations without connecting to real Supabase, Postgres, Stripe, or Resend services.
- [x] 2.2 Add regression coverage for signed-out, valid-session, and expired-session dashboard behavior, including direct loads and application navigation where the available harness supports them.
- [x] 2.3 Add checks proving request memoisation does not outlive a render, authenticated responses are not publicly cached, and equivalent requests from two mocked tenant identities cannot reuse protected results.
- [x] 2.4 Establish a focused executable performance check for the blocking dashboard path so each server-side change can be compared with the same operation/query count and timing method.

## 3. Authenticated Server Path Optimisation

- [x] 3.1 Verify the existing React-cached authenticated-user helper produces one authoritative `auth.getUser()` call per application render while retaining the proxy's separate validation/session-refresh boundary; repair only measured duplicate application-render calls.
- [x] 3.2 Introduce request-scoped reuse for profile and dashboard context fields shared by the layout and overview, keyed by verified identity and stable inputs, with no module-global or cross-request cache.
- [x] 3.3 Replace repeated overview reads with the smallest route-specific RLS-scoped overview loader or safe view model supported by baseline evidence; select only required fields and reduce transaction/query count while preserving all dashboard values, trial gates, billing entitlements, arrangements, promises, and risk calculations.
- [x] 3.4 Keep dependent queries sequential on one interactive transaction; test independent transaction concurrency only if needed, and adopt it only when adapter warnings, pool pressure, transaction timeouts, tail latency, and tenant isolation remain acceptable.
- [x] 3.5 Rerun the focused dashboard check after each server change and retain only changes that measurably improve blocking duration, transaction count, query count, or duplicate work without changing visible output.

## 4. Rendering, Hydration, and Routing Optimisation

- [x] 4.1 Use the production build and browser baseline to identify material client entry points, large imports, hydration work, initial duplicate fetches, font/image cost, and third-party script cost for the dashboard.
- [x] 4.2 Narrow measured unnecessary client boundaries and defer measured non-critical interactive code while preserving Server Component delivery of initial data and complete loading/error behavior for deferred interactions.
- [x] 4.3 Add a fast protected dashboard shell and `Suspense` streaming only for genuinely independent lower-priority sections whose delay currently blocks useful content; ensure streamed sections reuse request context and do not repeat auth, profile, or tenant queries.
- [x] 4.4 Remove any measured avoidable post-hydration request for data already rendered by the server, while retaining on-demand detail fetches that reduce initial work and are not part of useful dashboard content.
- [x] 4.5 Tighten the proxy matcher only for routes proven not to require session refresh, auth-aware redirects, LIVE gating, or admin/dashboard protection, and add safe revalidation only to genuinely public cookie-independent data.
- [x] 4.6 Rerun the focused browser and server checks after each rendering, client, proxy, or caching change and omit unsupported optimisations rather than changing code without evidence.

## 5. Diagnostics and Deployment Guidance

- [x] 5.1 Extend existing structured diagnostics only where the baseline lacks stage attribution, using bounded correlation-safe timings or `Server-Timing` output that excludes secrets, tokens, user IDs, client data, invoice values, and high-cardinality labels.
- [x] 5.2 Measure diagnostic overhead and ensure production debug controls cannot create material function-time or log-volume regressions.
- [x] 5.3 Update the Vercel/Supabase runbook with exact manual checks for compute and database region alignment, Fluid Compute, cold starts, function duration percentiles, Supabase query performance/indexes, pool pressure, and production observability; do not change infrastructure regions automatically.
- [x] 5.4 Document the confirmed diagnosis, critical path before optimisation, each material code change with security considerations, and an evidence-backed before/after table that marks unavailable values instead of estimating them.

## 6. Final Verification

- [x] 6.1 Run focused changed-slice tests, `npm run lint`, `npx tsc --noEmit`, `npm run test`, and `npm run build`; record all results, route/build changes, warnings, and unavailable checks.
- [x] 6.2 Run `npm run verify-rls` against an approved test database when available; otherwise report the live-database requirement and rely on focused mocked isolation tests without claiming full RLS verification.
- [x] 6.3 Verify signed-out, signed-in, expired-session, logout, direct-load, client-navigation, trial-gate, dashboard interaction, and error behavior using the available production-mode environment.
- [x] 6.4 Confirm no authenticated or tenant-specific response is publicly cached, no authorization/RLS check was removed, no secret/server-only module entered the browser bundle, and no new customer data appears in diagnostics.
- [x] 6.5 Repeat the baseline measurement method, report observed before/after results and remaining risks, and list credentials or Vercel, Supabase, Postgres, and Railway dashboard actions that remain outside repository access.
