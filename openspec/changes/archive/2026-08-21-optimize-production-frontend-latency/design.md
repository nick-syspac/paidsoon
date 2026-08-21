# Optimize Production Frontend Latency Design

## Context

See `proposal.md` for motivation and `specs/authenticated-frontend-performance/spec.md` for the behavioral contract.

PaidSoon is one Next.js App Router deployment on Vercel. A signed-in dashboard request currently crosses these boundaries:

1. `proxy.ts` creates a cookie-aware Supabase client, refreshes or validates the session with `auth.getUser()`, and enforces dashboard and admin entry rules.
2. `app/dashboard/layout.tsx` uses the React-cached `getAuthenticatedUser()`, then opens an RLS transaction to load profile, trial, tier, and display data.
3. `app/dashboard/page.tsx` reuses the cached application-render identity and invokes dashboard loaders sequentially.
4. Each loader uses `withUserContext()`, which opens an interactive transaction, sets the local authenticated role and JWT claims, executes user-scoped queries under RLS, and commits.
5. `loadDashboardInvoices()` performs a base invoice query followed by relation and arrangement queries whose later inputs depend on earlier results.
6. Server Components render the overview before client dashboard components hydrate; selected interactions issue authenticated route requests on demand.

The repository already has correlation-aware structured tracing around proxy, layout, dashboard loaders, and rendering. It has no standalone `typecheck` script, browser performance suite, or committed production telemetry. Dashboard comments also record that concurrent queries on one interactive transaction share a single `pg` client and have produced unsafe adapter behavior, so `Promise.all` inside one transaction is not an acceptable default.

## Goals / Non-Goals

**Goals:**

- Produce a reproducible baseline and comparison using available production-mode evidence.
- Attribute latency to auth, RLS setup, database/query work, rendering, hydration, browser requests, or bundles before selecting a fix.
- Reduce repeated application-render identity/profile work, avoid unnecessary transactions and queries, and shorten the blocking dashboard chain.
- Preserve direct loads, client navigation, signed-out and expired-session handling, trial gates, authorization, and RLS isolation.
- Leave operators with exact deployment checks where Vercel or Supabase access is required.

**Non-Goals:**

- Setting numerical latency service-level objectives without production traffic evidence.
- Replacing Supabase Auth, Prisma, RLS, the App Router, or the hosting platform.
- Making authenticated pages static or globally caching tenant data.
- Automatically changing Vercel, Supabase, Postgres, or Railway regions.
- Hiding blocking work behind loading UI without reducing or safely moving that work.
- Rewriting unrelated dashboard features or adding a performance/state-management library by default.

## Decisions

### 1. Baseline and trace before optimization

Run the repository's existing lint, test, and build scripts plus `npx tsc --noEmit` because no typecheck script exists. Capture the production build's route classification, warnings, and available size output. Use the existing structured trace stages to count and time auth, layout, RLS, loader, and render operations. When a production URL and safe authenticated measurement account are available, use one repeatable browser flow for direct dashboard load and client navigation; otherwise use a local production server and mark deployment-only TTFB, cold-start, and regional observations unavailable.

Alternative considered: implement commonly recommended Next.js optimizations immediately. Rejected because it would not establish causality or support a reliable before-and-after result.

### 2. Treat proxy and application auth as distinct phases

Retain verified `auth.getUser()` behavior in the proxy for session refresh and route entry enforcement. Retain authoritative application-render validation because the render cannot trust forwarded user data from the request. Continue using React request memoisation to deduplicate layout/page calls within the render phase, and add tests or trace assertions that prove the expected count.

Alternative considered: decode the cookie once and forward identity from the proxy. Rejected because it weakens revocation/session validation and changes the trust boundary.

### 3. Reuse request-scoped dashboard context, never global user data

Where layout and page need the same profile fields, expose a request-memoised authenticated context keyed by the verified user and stable loader inputs. The memoised function may contain RLS-backed reads, but its lifetime is one React server request. Do not use module maps, `unstable_cache`, route output caching, or public cache headers for authenticated context.

Alternative considered: cross-request profile caching keyed only by user ID. Rejected because tier, trial, session, and authorization freshness are behaviorally significant and invalidation would broaden the security surface.

### 4. Prefer fewer RLS transactions and queries over unsafe in-transaction concurrency

Use trace/query evidence to identify repeated profile and dashboard reads. Prefer a route-specific overview loader that performs the minimum selected queries inside one `withUserContext()` boundary and returns a safe view model. Keep dependent operations sequential on the interactive transaction. Consolidate with Prisma relation selection or a parameterized structured query only when RLS still applies and the resulting shape remains testable. Independent transactions may run concurrently only after an executable adapter/pool test shows no client warnings, pool regression, timeout increase, or tenant-context leakage.

Alternative considered: wrap all existing loaders in `Promise.all`. Rejected as the default because each transaction consumes pooled capacity and existing comments document unsafe overlap on shared request-scoped clients; reducing wall time at the cost of pool saturation would increase production tail latency.

### 5. Stream only genuinely independent, lower-priority sections

After query consolidation, split the overview into a fast shell/primary summary and independent secondary sections only if measurement shows a useful render improvement. Use Server Component `Suspense` boundaries and existing loading conventions. Authentication, trial gating, and the minimum tenant context remain ahead of protected content. A section must not independently repeat the same auth/profile/query work merely to enable streaming.

Alternative considered: add skeletons around every widget. Rejected because visual loading states alone do not improve server execution or request count.

### 6. Optimize client boundaries from build and browser evidence

Inspect client-entry imports, route chunks, fonts, images, analytics, and third-party code. Narrow client components to interactive leaves, pass safe display models, and dynamically import only measured non-critical code. Preserve server rendering of initial dashboard data and keep on-demand requests for details that are not needed for useful initial content unless measurements show preloading is beneficial.

Alternative considered: move the dashboard to client fetching for a faster shell. Rejected because it adds a post-hydration waterfall and duplicates server authentication/data work.

### 7. Extend existing diagnostics rather than add a vendor

Use the current trace context and operation helpers for server-stage durations and correlation. Add a bounded `Server-Timing` view or summarized measurement output only if it can exclude secrets, user IDs, invoice/customer data, and high-cardinality labels. Keep production debug controls explicit and measure their overhead.

Alternative considered: install a new APM package during the first pass. Rejected until existing Vercel telemetry and repository diagnostics prove insufficient.

### 8. Evaluate proxy scope and caching by route category

Compare the matcher and actual route requirements. Exclude assets and routes that require neither session refresh nor auth-aware redirects only when sign-in, sign-out, token refresh, LIVE gating, admin defense-in-depth, and dashboard protection remain unchanged. Apply shared revalidation solely to genuinely public data with no cookie-dependent output.

Alternative considered: bypass proxy auth for all public pages. Rejected because authenticated redirects and session cookie refresh may still be required on selected public/auth routes.

## Risks / Trade-offs

- **[Fewer transactions create a longer interactive transaction]** -> Select only required fields, avoid external I/O inside the transaction, measure duration, and retain timeout/retry behavior.
- **[Concurrent transactions reduce one request's latency but exhaust the pool]** -> Require pool-aware validation and compare tail behavior before adopting concurrency.
- **[Streaming repeats shared reads or delays primary content]** -> Define one request-scoped context and stream only sections with independent data after the primary useful view is identified.
- **[Memoisation serves stale or cross-user data]** -> Use React request memoisation only, include verified inputs, and add isolation/cache-header checks.
- **[Instrumentation increases execution time or leaks data]** -> Reuse bounded diagnostics, prohibit sensitive fields, and compare enabled/disabled overhead.
- **[Local results fail to represent Vercel-to-Supabase latency]** -> Separate local and deployed results and list required production checks without extrapolating.
- **[Bundle reduction changes interaction timing]** -> Test direct load, client navigation, and deferred interaction loading/error states.

## Migration Plan

1. Record clean baseline checks, build output, trace counts, browser measurements, and environment limitations before changing runtime behavior.
2. Add focused tests for request-scoped deduplication, safe response caching, and unchanged auth/tenant behavior.
3. Implement one measured server-side optimization at a time, beginning with duplicate context work and query/transaction count; rerun the focused measurement after each change.
4. Apply streaming, client-boundary, proxy, or public-cache changes only where the baseline identifies material cost, validating each independently.
5. Run lint, `npx tsc --noEmit`, relevant tests, the full test suite, production build, auth behavior checks, and available RLS verification.
6. Compare results using the baseline method and document production dashboard actions and residual risks.
7. Roll back an optimization independently if it worsens measured latency, pool behavior, auth behavior, or isolation; no data migration is expected.

## Open Questions

- What are the production Vercel Function, Supabase Auth, and Postgres regions, and are they aligned?
- Is Fluid Compute enabled, and what do Vercel cold-start and function-duration percentiles show for authenticated routes?
- Which safe production or preview account and URL can be used for repeatable authenticated browser measurements?
