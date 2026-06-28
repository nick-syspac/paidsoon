## Why

The platform admin section has read-only list views but no ability to quickly diagnose *why* a user is having problems or take safe corrective actions. When a support request comes in, an operator must manually cross-reference multiple tables to understand the issue — there is no guided workflow. This creates slow support resolution and operational risk as the user base grows.

## What Changes

- Collapse the redundant `/admin/tenants` and `/admin/users` pages into a single searchable tenant list (email + name search).
- Add a `/admin/tenants/[userId]` tenant detail view that shows the full health picture of one user in a single page: subscription, connections, schedule, invoice counts, email log, and email settings.
- Introduce a server-side **diagnostics engine** (`lib/admin/diagnostics/`) that evaluates a set of named checks against a tenant's current state and returns structured issues with severity, description, runbook reference, and available actions.
- Surface diagnostic issues prominently in the tenant detail view — detected problems appear as cards with clear explanations and one-click corrective actions.
- Implement the first set of **safe corrective actions** (low-risk, audit-logged, reversible): reset custom email From to system default, extend trial period, trigger accounting resync.
- Add a runbook index at `/admin/runbooks` with one prose runbook per diagnostic check, linked from each issue card.
- Audit-log every admin action taken against a tenant (via `AdminAuditEvent` with `tenantId` set).

## Capabilities

### New Capabilities

- `admin-tenant-detail`: Full single-tenant health view at `/admin/tenants/[userId]`. Aggregates subscription, connections, schedule, invoice counts, email log, and email settings in one server-rendered page. Includes a tenant search on the list view.
- `admin-diagnostics-engine`: Server-side diagnostic system (`lib/admin/diagnostics/`) that evaluates named checks against a `TenantSnapshot` and returns structured `Diagnostic` objects with severity, title, description, runbook slug, and available `Action` items. Runs on every tenant detail page load.
- `admin-corrective-actions`: A set of safe, audit-logged admin actions that can be triggered from the tenant detail view: (1) reset email From address to system default, (2) extend trial by N days, (3) trigger accounting provider resync. Each action calls a dedicated `/api/admin/tenants/[userId]/actions/[action]` endpoint, requires full admin elevation, and writes an `AdminAuditEvent`.
- `admin-runbooks`: A runbook index page at `/admin/runbooks` and individual runbook pages at `/admin/runbooks/[slug]`. Each runbook is a prose document explaining the diagnostic, its causes, and the recommended resolution steps. Linked from diagnostic issue cards.

### Modified Capabilities

- `subscription-plan-tiers`: No requirement change. Trial extension action touches `trialEndsAt` only — billing logic and Stripe subscription state are unchanged.

## Impact

- **Removed**: `/admin/users/page.tsx` (collapsed into tenants).
- **New pages**: `/admin/tenants/[userId]/page.tsx`, `/admin/runbooks/page.tsx`, `/admin/runbooks/[slug]/page.tsx`.
- **New API routes**: `/api/admin/tenants/[id]/actions/reset-email-from`, `/api/admin/tenants/[id]/actions/extend-trial`, `/api/admin/tenants/[id]/actions/trigger-resync`.
- **New lib**: `lib/admin/diagnostics/index.ts` and per-check files.
- **Modified**: `/admin/tenants/page.tsx` — adds search input; `/api/admin/tenants/route.ts` — adds `?search=` query param support.
- **Schema**: No new Prisma models required. `UserProfile.trialEndsAt` is updated by the extend-trial action.
- **Dependencies**: No new packages. Supabase admin API used to fetch user email (already available via `SUPABASE_SECRET_KEY`).
- **Docs**: `docs/DDD.md` (new routes), `docs/runbooks/admin.md` (corrective actions section).
- **Tests**: New test file `tests/admin-diagnostics.test.ts` covering each diagnostic check with healthy and unhealthy tenant states.
