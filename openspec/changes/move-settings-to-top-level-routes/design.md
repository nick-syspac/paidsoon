# Design

## Context

See `proposal.md` for motivation. Today, settings pages live under `app/dashboard/settings/*`, so requests to settings render inside the dashboard shell and dashboard left rail. The target is a hard cutover to top-level `/settings/*` routes with no backward-compatibility redirects from `/dashboard/settings/*`.

Constraints:
- Preserve existing auth and entitlement checks already implemented on settings pages.
- Preserve existing settings page components and behavior; only route namespace and shell ownership changes.
- Preserve provider callback UX by rewriting callback return destinations to `/settings/connections`.
- Keep existing in-namespace helper redirects (`/settings/stripe`, `/settings/integrations`) to `/settings/connections`.

## Goals / Non-Goals

**Goals:**
- Separate dashboard and settings shell contexts so only one left navigation context appears per page.
- Make `/settings/*` the canonical settings namespace across UI links, redirects, constants, and callbacks.
- Keep settings feature behavior and access gating unchanged after namespace migration.

**Non-Goals:**
- No redesign of settings information architecture, labels, or entitlement policy.
- No database schema, RLS policy, or billing model changes.
- No backward-compatible redirects from `/dashboard/settings/*`.

## Decisions

### 1) Move settings to a real top-level route tree
- Decision: Re-home `app/dashboard/settings/*` pages and layout to `app/settings/*`.
- Rationale: Route ownership by top-level layout cleanly removes nested dashboard shell effects.
- Alternatives considered:
  - Conditional rendering in dashboard layout for `/dashboard/settings/*`: lower effort but couples shell behavior to pathname checks.
  - Route-group remap without top-level namespace: reduces URL clarity and does not satisfy `/settings/*` objective.

### 2) Update canonical destinations at source-of-truth link/config layers
- Decision: Rewrite settings path constants and nav metadata first, then references.
- Rationale: Centralized metadata (`lib/settings/navigation.ts`, billing/access constants) fan out to many UI surfaces and reduces missed path rewrites.
- Alternatives considered:
  - Per-page edits only: higher chance of missing generated links and callback destinations.

### 3) Preserve callback-and-flash flow semantics under new namespace
- Decision: Update all integration callback targets and helper redirect routes to land on `/settings/connections` with existing query params unchanged.
- Rationale: Connect/cancel/error UX relies on query-driven flash/status handling.
- Alternatives considered:
  - New callback payload format: unnecessary and riskier for a route namespace migration.

### 4) Hard cutover without old-path redirects
- Decision: Do not support `/dashboard/settings/*` after release.
- Rationale: Explicit product decision to avoid carrying dual namespaces.
- Alternatives considered:
  - Transitional redirects: better external compatibility, but explicitly rejected for this change.

## Risks / Trade-offs

- [Risk] Missed `/dashboard/settings/*` reference causes broken redirect, CTA, or callback landing.
  -> Mitigation: repository-wide path search before merge and post-change zero-match verification for old namespace in app/components/lib.

- [Risk] Third-party or bookmarked links to old settings namespace fail after deploy.
  -> Mitigation: accepted trade-off under hard cutover decision; communicate in release notes.

- [Risk] Moving route files could alter auth/layout behavior unexpectedly.
  -> Mitigation: preserve per-page auth checks and validate representative `/settings/*` pages for unauthenticated redirect behavior.

## Migration Plan

1. Create `app/settings/layout.tsx` from current settings layout semantics and move/re-home settings pages to `app/settings/*`.
2. Update settings navigation metadata and active matching to `/settings/*` paths.
3. Rewrite all dashboard, settings, billing, and helper links/redirects/constants from `/dashboard/settings/*` to `/settings/*`.
4. Rewrite integration and billing callback return URLs to `/settings/*` destinations.
5. Remove old `app/dashboard/settings/*` route files.
6. Validate no remaining `/dashboard/settings` references in app/components/lib and run targeted route smoke tests.

Rollback:
- Revert the change set and redeploy. No data migration is involved.

## Open Questions

None.
