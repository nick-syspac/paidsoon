# Frontend Performance Verification

This record covers the `optimize-production-frontend-latency` change measured on 2026-08-15. It separates repository-confirmed behavior from production checks that require Vercel and Supabase access.

## Measurement Method

- Runtime: Node 26.5.1 locally. The repository and deployment target declare Node 24.x, so production must continue using Node 24.
- Package manager: npm.
- Production build: `npm run build` (`prisma generate && next build`).
- Browser: one Chromium navigation through the VS Code Playwright integration against `next start -p 4010`.
- Cold public navigation: browser HTTP cache cleared through CDP, then navigate to `/` and wait for network idle.
- Signed-out dashboard check: navigate directly to `/dashboard`, follow the redirect to `/sign-in`, and wait for page load.
- Authenticated dashboard measurements were unavailable because no safe deployed URL and test account were provided. No local or production credentials were read or recorded.
- Vercel function telemetry, Supabase query telemetry, production regions, cold starts, and Fluid Compute settings were unavailable from repository access.

This is a single local before/after sample, not a production percentile. Use the same flow for at least five cold production navigations before treating paint or TTFB differences as durable.

## Baseline Checks

| Check | Before runtime edits |
| --- | ---: |
| `npm run lint` | Passed, 4.54 s |
| `npx tsc --noEmit` | Failed with four pre-existing test-only errors |
| `npm run test` | 501 passed, 0 failed, 1.40 s |
| `npm run build` | Passed, 10.16 s |
| Route classification | Dashboard dynamic; public marketing routes static |
| Build warning | Node `module.register()` deprecation warning |

The pre-existing TypeScript errors are duplicate object properties in `tests/dashboard-currency-summaries.test.ts` and outdated `MockModuleOptions` typing in `tests/dashboard-held-invoices.test.ts`. The production build's own TypeScript phase passes.

Next.js 16.2.9 did not print route byte sizes. The pre-change output contained 2,296 KiB of JavaScript chunks and 192 KiB of media across the complete application. The dashboard overview manifest referenced 537,860 raw JavaScript bytes, approximately 159,986 bytes after gzip. The largest referenced chunk includes framework/runtime code and the small dashboard shell clients; no editor or other separable heavy dashboard dependency was found.

## Diagnosis

### Confirmed cause: broad proxy authentication work

The previous matcher ran the proxy for every path except static assets. Public-page link prefetches therefore executed `supabase.auth.getUser()` even though those routes are statically generated and do not render authenticated data. The public baseline issued 52 browser requests, including prefetched marketing routes, creating repeated Vercel proxy and Supabase Auth work.

The proxy is now limited to dashboard routes, admin UI/API routes, and sign-in/sign-up. User-facing API routes continue to perform their own authoritative `getUser()` validation. Dashboard/admin protection, session refresh on protected navigation, LIVE auth-entry gating, and admin defense-in-depth remain in the proxy.

### Confirmed cause: dashboard RLS transaction waterfall

Before optimization, a non-empty overview render used six RLS transactions: one layout profile transaction and five sequential page loader transactions. Each transaction executes `SET LOCAL ROLE authenticated` and one batched claim setup statement before application queries.

The layout and overview path also loaded the same profile three times: layout profile, dashboard context profile, and allowance profile. With active invoices and arrangements, the path could execute approximately 29 SQL statements including RLS setup.

The overview now performs one request-memoised profile transaction and one consolidated overview transaction. Transaction-local queries remain sequential because the Prisma interactive transaction shares one `pg` client. The equivalent non-empty path uses approximately 19 SQL statements, and the profile is loaded once.

### Not confirmed as causes

- No initial client-side dashboard data refetch was found. Arrangement detail and invoice action requests are user-triggered.
- The dashboard client shell uses `usePathname()` and small interaction components. No route-specific heavy dependency justified dynamic imports or a client-boundary rewrite.
- Streaming was not added because the consolidated overview uses one intentionally sequential RLS transaction; splitting sections would repeat tenant work or require more concurrent pool connections without production pool evidence.
- Fonts are emitted globally, but both sans and mono families are used by implemented routes.
- Region mismatch, cold starts, database indexes, and pool contention remain unverified production risks.

## Critical Request Path

### Before

```text
proxy auth.getUser
  -> cached application-render auth.getUser
  -> layout RLS transaction: profile
  -> context RLS transaction: profile -> connection -> allowance profile -> allowance count
  -> invoice RLS transaction: invoices -> logs -> promises -> coverages -> arrangements -> scopes
  -> broken-promise RLS transaction
  -> escalation-policy RLS transaction
  -> metrics RLS transaction: paid rows -> paid count -> resolved count -> reminder count
  -> render -> hydrate
```

### After

```text
protected routes only: proxy auth.getUser
  -> cached application-render auth.getUser
  -> request-cached RLS transaction: profile
  -> one overview RLS transaction:
       connection -> allowance count -> invoices and relations
       -> broken promises -> escalation policy -> metrics
  -> render -> hydrate
```

## Changes and Security Considerations

| Area | Change | Latency effect | Security behavior |
| --- | --- | --- | --- |
| Proxy matcher | Restrict proxy execution to routes that need proxy-level auth behavior | Removes Supabase Auth and function work from public pages, public prefetches, and APIs with route-level auth | Dashboard/admin protection and verified `getUser()` remain |
| Dashboard profile | Reuse one React request-memoised profile read | Removes duplicate profile queries within one render | Cache lifetime is one React request; no module-global or cross-request user cache |
| Overview loader | Run existing overview domains inside one RLS transaction | Reduces page RLS transactions from five to one | `withUserContext()` still sets the authenticated role and claims; every query keeps `userId` scoping |
| Allowance calculation | Reuse the RLS-loaded profile and query only usage | Removes one profile query | Existing tier, period, and allowance calculation is unchanged |
| Tests | Add orchestration, transaction-count, matcher, and proxy-auth coverage | Detects request-path regressions | Tests use mocks and no real database or auth service |

No authenticated response cache, public cache header, authorization bypass, RLS change, schema change, dependency, client data exposure, or new diagnostic field was introduced.

The disabled `traceOperation()` fast path added approximately 0.036 microseconds per call in a 100,000-iteration local microbenchmark. Debug tracing remains opt-in and emits no events when disabled. This synthetic result confirms negligible disabled-path overhead but does not replace production log-volume monitoring when `DEBUG=true`.

## Results

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Public local TTFB, one cold sample | 70.8 ms | 30.3 ms | -40.5 ms (-57.2%) |
| Public local FCP, one cold sample | 416 ms | 96 ms | -320 ms; too noisy for production claim |
| Public local LCP, one cold sample | 416 ms | 96 ms | -320 ms; too noisy for production claim |
| Useful authenticated dashboard render | Unavailable | Unavailable | Requires safe account and deployed URL |
| Browser requests on public initial load | 52 | 52 | No browser request change |
| JavaScript transferred on public initial load | 229,960 B | 229,960 B | No change |
| Total public transfer | 341,990 B | 341,985 B | Effectively unchanged |
| Dashboard RLS transactions per overview render | 6 | 2 | -4 (-66.7%) |
| Dashboard profile queries per overview render | 3 | 1 | -2 (-66.7%) |
| Approximate non-empty dashboard SQL statements including RLS setup | 29 | 19 | -10 (-34.5%) |
| Dashboard manifest JavaScript, gzip estimate | 159,986 B | 159,986 B | No material change expected |
| Production build duration | 10.16 s | 10.74 s | +0.58 s; local noise |

The browser still requests prefetched public pages, but those requests no longer invoke the auth proxy. Browser request count therefore stays constant while Vercel Function and Supabase Auth work falls. Production telemetry must confirm the function invocation and duration reduction.

## Production Verification

1. Use a non-production-data test account on a preview deployment aligned with production regions.
2. Capture at least five cold direct `/dashboard` loads and five client navigations from `/dashboard/invoices` to `/dashboard`.
3. Record p50/p95 TTFB, FCP, LCP, INP, useful overview render, requests, JavaScript transfer, and slowest resources.
4. Enable PaidSoon structured debug tracing temporarily and count `proxy.supabase_get_user`, `dashboard.layout.auth`, `dashboard.layout.profile_load`, and `dashboard.load_overview` events per trace. Disable `DEBUG` after capture.
5. Confirm one application-render auth call, one profile load, and one overview RLS transaction per overview render.
6. Compare Vercel function invocations for static marketing routes and RSC prefetches before and after deployment.
7. Run the Vercel and Supabase checks in their respective runbooks.

## Final Repository Verification

| Check | Result |
| --- | --- |
| Focused performance/auth regression suite | 45 passed, 0 failed |
| `npm run lint` | Passed, 4.39 s |
| `npx tsc --noEmit` | Same four pre-existing test-only errors as baseline; no new errors |
| `npm run test` | 509 passed, 0 failed, 1.43 s |
| `npm run build` | Passed, 10.39 s |
| Next.js route classification | Unchanged; dashboard dynamic and public marketing routes static |
| `npm run verify-rls` | Not run; requires an explicitly approved live test database |
| Signed-out/expired/valid auth behavior | Passed mocked proxy tests; signed-out direct browser redirect passed |
| Authenticated browser navigation and logout | Unavailable without a safe test account |

The final build retained the Node `module.register()` deprecation warning. Local browser testing also observed the expected analytics 404 outside Vercel.

## Remaining Limitations

- Authenticated production metrics, INP, client-side dashboard navigation, and useful-content timing were not measurable without a safe account and URL.
- `npm run verify-rls` requires an approved live test database and was not run during local browser measurement.
- Railway is not in the current dashboard request path. If scheduled workloads or future APIs move there, verify its service region is aligned with Supabase separately; do not move it based on frontend measurements alone.
- The local analytics endpoint returns 404 outside Vercel, and Turnstile's external challenge was unavailable in the local browser environment. Neither was treated as production evidence.
