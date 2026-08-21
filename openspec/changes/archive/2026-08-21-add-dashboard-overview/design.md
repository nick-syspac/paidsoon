## Context

`/dashboard` currently renders `app/dashboard/page.tsx`, which does two jobs in one
route: (1) load and gate invoice data, (2) render a full `InvoiceTable`. The
"resolved" view is the *same* route with `?resolved=1` toggling which `status`
bucket is queried (`activeStatuses` vs `resolvedStatuses`) and which feature flag
gates it (`overdue_invoice_dashboard` vs `payment_status_dashboard`). Both flags are
`true` for every tier in `lib/subscriptionPlans.ts` today, so `canShowDashboardModule`
/ `LockedDashboardPreview` never actually trigger for a real tier — the real
tier lever is `chasedInvoicesPerMonth` (chase-volume allowance), surfaced today only
as a text line + `UpgradeBanner` at `nearLimit`/`atCapacity`.

Several signals used for per-row styling in `InvoiceTable.tsx` are not surfaced
anywhere else: `heldInvoiceIds` (rate-limited, computed in `page.tsx` but only used
to dim rows), `brokenByDebtor` (broken promise counts), and `chaseAllowance`
(`lib/billing.ts`, `getChaseAllowanceStatus`). This design reuses all of them rather
than introducing new domain queries.

The existing tab-navigation pattern (`app/dashboard/settings/layout.tsx`, a `Link`
strip over child routes) establishes the routing convention (child routes under a
shared layout), but the new `/dashboard` tabs are laid out vertically on the left
side of the page rather than as a horizontal strip — a new layout, not a direct
reuse of the settings tab strip's visual style.

## Goals / Non-Goals

**Goals:**
- One glance at `/dashboard` (Overview) answers "is anything wrong right now?" using
  data already computed for the invoice table today.
- Move the active invoice table to `/dashboard/invoices` and the resolved view to
  `/dashboard/resolved`, each a real route (no query-param view toggle).
- Keep Overview ungated for every tier (matches current entitlements, not a new
  relaxation).
- Card severities are deterministic functions of existing fields
  (`currentStage`, `chaseAllowance`, broken-promise counts, held-invoice count) — no
  new schema fields, no new cron logic.

**Non-Goals:**
- No multi-client / cross-tenant rollup (out of scope — `accountant_partner` /
  `multi_client_management` is a separate, not-yet-implemented feature).
- No live/real-time updates — Overview reflects state as of last page load, same
  freshness as the existing dashboard (data changes on cron runs + user actions,
  not polling).
- No new `SubscriptionFeature` flag or plan/pricing change.
- No change to email-sending logic, chase-allowance accounting, or RLS policies.

## Decisions

**1. Card set (4 cards): Overdue, Chase allowance, Broken promises, Held invoices.**
Each is a small aggregate over invoices already loaded for the (soon to be)
`/dashboard/invoices` query, reusing the same `withUserContext` query shape rather
than adding new endpoints. Rejected a single "traffic light per invoice" list
(model A from exploration) because it's just a compressed version of the existing
table and doesn't answer "am I okay?" without reading rows; rejected a single
rolled-up light (model C) because it hides *which* thing needs attention, forcing
a click-through to find out — the 4-card model names the problem at a glance
while staying a fixed, boring shape (no per-user card count to manage).

**2. Severity is derived from existing discrete state, not day-count thresholds.**
- *Overdue* card: green if no active invoice has `currentStage >= 2`; yellow if
  any invoice is at `currentStage === 2`; red if any invoice is at
  `currentStage === 3` (final reminder already sent, still unresolved).
  `currentStage` is schedule-agnostic (works regardless of a user's custom
  `Schedule.email1/2/3DaysAfterDue`), whereas raw day-count thresholds would need
  to be either hardcoded (wrong for customized schedules) or read per-user schedule
  config (more moving parts than this warrants).
- *Chase allowance* card: reuses `chaseAllowance.nearLimit` / `.atCapacity` directly
  from `lib/billing.ts` (`getChaseAllowanceStatus`) — green/yellow/red already
  exists as a two-boolean state machine there; no new logic.
- *Broken promises* card: red if `Object.keys(brokenByDebtor).length > 0`
  (any debtor over `escalationThreshold`), else green. No yellow state — a broken
  promise past the threshold is unambiguous.
- *Held invoices* card: yellow if `heldInvoiceIds.size > 0` (rate-limited, waiting
  on allowance reset), else green. Not red — being held is expected, transient
  behavior under a volume cap, not a client-side risk signal like a broken promise.

**3. Resolved Invoices becomes a real route (`/dashboard/resolved`), not a query
param.** Matches the Invoices split and removes the need for
`LockedDashboardPreview` / `canViewPaymentStatus` branching inside a single page
component. Old `/dashboard?resolved=1` links become dead (see Migration Plan) —
acceptable since this is an internal dashboard, not an indexed/bookmarked public
page, and the only known referrers are the app's own UpgradeBanner/nudge
components listed in the proposal's Impact section.

**4. Tab navigation is a left-side vertical rail in `app/dashboard/layout.tsx`**
(already the shared authenticated-shell layout for all `/dashboard/*` routes),
with the 3 tabs — Overview, Invoices, Resolved Invoices — stacked top-to-bottom
in a left column, page content rendered to the right of it. This is a new layout
(two-column: nav rail + content), not a reuse of
`app/dashboard/settings/layout.tsx`'s horizontal strip, since that pattern is
horizontal-only. Active-tab highlighting is required (Overview is the landing
page and needs to be visually distinguishable from Invoices/Resolved Invoices).
On small screens the rail SHALL collapse to a horizontal strip or equivalent
compact control (exact responsive treatment left to implementation) rather than
permanently consuming left-side width on mobile.

**5. Each card click-through deep-links into `/dashboard/invoices` with a filter
query param** (e.g. `?filter=broken_promises`, `?filter=held`), rather than
duplicating table-filtering logic on the Overview page itself. `InvoiceTable`
already has the data needed to filter client-side once loaded; Overview never
needs to know how to render invoice rows.

## Risks / Trade-offs

- **[Risk]** Breaking existing bookmarks/links to `/dashboard?resolved=1`.
  → **Mitigation**: keep a redirect from `/dashboard?resolved=1` to
  `/dashboard/resolved` for one release (cheap `redirect()` in the Overview page
  based on the search param) rather than a hard 404/silent ignore.
- **[Risk]** Card severity thresholds (stage 2 = yellow, stage 3 = red) are a
  product judgment call that may not match owner expectations once used in
  practice. → **Mitigation**: thresholds are isolated in one small pure function
  per card (testable, easy to retune later without touching data-loading code).
- **[Risk]** Splitting one page into three route files triples the number of
  places that repeat auth/profile/tenant-loading boilerplate seen in the current
  `page.tsx` (trace context, `supabase.auth.getUser()`, etc.).
  → **Mitigation**: factor the shared "load profile + connection + chase allowance"
  block already in `page.tsx` into a helper used by all three routes, so the
  boilerplate is written once, not three times.

## Migration Plan

1. Extract the shared data-loading block (profile, connection, chase allowance,
   invoices-by-status, broken-promise counts, held-invoice ids) from
   `app/dashboard/page.tsx` into a reusable helper.
2. Add `app/dashboard/invoices/page.tsx` (active statuses, today's table) and
   `app/dashboard/resolved/page.tsx` (resolved statuses, today's resolved table),
   using the helper.
3. Rewrite `app/dashboard/page.tsx` as the new Overview: compute the 4 card
   severities from the same helper's output, render cards only (no `InvoiceTable`).
4. Add the left-side vertical tab navigation (Overview / Invoices / Resolved
   Invoices) to `app/dashboard/layout.tsx`.
5. Update internal link targets (`UpgradeBanner`, `LockedDashboardPreview`,
   "Connect Stripe" nudge, any `?intent=` consumers) to the new routes.
6. Add a temporary redirect: `/dashboard?resolved=1` → `/dashboard/resolved`.
7. Run `npm run test` (existing dashboard-related tests reference the old single
   route — expect to update `tests/dashboard-*.test.ts` alongside the route split).

No database migration, no RLS policy change, no environment variable change.

## Open Questions

- Exact wording/thresholds for the "Overdue" card when there are zero active
  invoices at all (empty/healthy state) — a 5th "all clear" hero state, or just
  four green cards? (Left as a tasks-time UI decision, not a data-model decision.)
- Whether the temporary `/dashboard?resolved=1` redirect (Risk #1) should be
  removed in a follow-up change once confirmed no external references remain.
