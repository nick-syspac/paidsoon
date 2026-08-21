# Optimize Production Frontend Latency

## Why

PaidSoon's Vercel deployment is noticeably slower than local development, but the production-critical path has not been measured well enough to distinguish rendering, authentication, database, network, hydration, and bundle costs. We need an evidence-led performance pass that improves time to useful dashboard content without weakening verified Supabase authentication, Prisma-backed RLS, or per-user tenant isolation.

## What Changes

- Establish a repeatable production-mode baseline for initial response, useful dashboard rendering, request count, transferred JavaScript, route/build characteristics, and authenticated server work, while recording unavailable production telemetry rather than estimating it.
- Trace and instrument the signed-in dashboard path across the Next.js proxy, Supabase session validation, user/profile resolution, RLS transaction setup, dashboard data loaders, rendering, hydration, and browser follow-up requests.
- Remove measured duplicate authentication, profile, tenant, or dashboard work within a request by using request-scoped memoisation or consolidated RLS-scoped loaders where safe.
- Reduce measured request waterfalls by parallelising independent work, consolidating related queries, streaming independent dashboard sections, and eliminating avoidable post-hydration fetches when repository evidence supports those changes.
- Reduce measured client JavaScript and hydration work by narrowing client boundaries and deferring non-critical interactive code where the production build or browser baseline identifies material cost.
- Tighten proxy matching, cache public data safely, and add explicit revalidation only where measurements identify avoidable work and authenticated or tenant-specific responses cannot be shared.
- Add focused performance regression coverage and structured timing diagnostics that exclude secrets and customer data.
- Document before-and-after results and manual Vercel, Supabase, database, and region checks that require production dashboard access.

## Capabilities

### New Capabilities

- `authenticated-frontend-performance`: Defines measurable production-mode performance, request-path efficiency, observability, and security-preserving behavior for signed-in frontend routes, especially the dashboard.

### Modified Capabilities

None.

## Impact

- Affected runtime paths may include `proxy.ts`, `app/layout.tsx`, `app/dashboard/**`, `components/dashboard/**`, `lib/supabase/**`, `lib/dashboard/**`, `lib/db/**`, and dashboard-facing route handlers or server actions.
- Build and deployment analysis includes `package.json`, `next.config.ts`, `vercel.json`, font/image/script usage, route rendering classification, and Vercel Function behavior.
- Focused tests may be added under `tests/**`; operational findings and manual region or telemetry actions may update `docs/**` and relevant runbooks.
- No product behavior, billing entitlement, authentication semantics, authorization check, RLS policy, tenant boundary, or public API contract is intentionally changed.
- No new runtime dependency is expected unless measurement proves an existing platform capability cannot provide the required observability.
