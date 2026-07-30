## Why

Today `/dashboard` opens directly into the full overdue-invoice table. There is no
single view that tells a business owner "am I okay right now?" without reading every
row — they have to scan the whole list to notice a broken promise, a rate-limited
invoice, or that they're close to their monthly chase-volume limit. A red/green
"single pane of glass" overview, with the existing invoice list demoted to its own
tab, gives owners an at-a-glance health check while keeping the detailed workflow
one click away.

## What Changes

- Add a new **Overview** tab as the `/dashboard` root: a small set of traffic-light
  summary cards (red/yellow/green) surfacing overdue totals, chase-allowance usage,
  broken promises, and held (rate-limited) invoices — all values already computed
  today, just not surfaced outside the table.
- Move the existing active-invoice table to its own **Invoices** tab
  (`/dashboard/invoices`), unchanged in behavior.
- Move the existing resolved-invoice view (currently `?resolved=1` on the same page)
  to its own **Resolved Invoices** tab (`/dashboard/resolved`), as a real route
  instead of a query-param toggle.
- Add a left-side vertical tab navigation to `/dashboard` (Overview / Invoices /
  Resolved Invoices, stacked top-to-bottom on the left), rather than the
  horizontal `Link`-based tab strip pattern used in
  `app/dashboard/settings/layout.tsx`.
- Update internal deep links that currently point at `/dashboard?intent=...` or
  `/dashboard?resolved=1` (upsell banners, "Connect Stripe" nudge, locked-preview CTAs)
  to point at the new tab routes.
- The Overview tab is visible to every subscription tier — dashboard-view features
  (`overdue_invoice_dashboard`, `payment_status_dashboard`) are already `true` for
  every tier in `lib/subscriptionPlans.ts`; the tier differentiator is chase volume
  (`chasedInvoicesPerMonth`), not visibility, so no new feature flag is introduced.
- **BREAKING**: `/dashboard?resolved=1` no longer renders the resolved view; any
  bookmarked or externally-linked URL in that form must be updated to
  `/dashboard/resolved`.

## Capabilities

### New Capabilities
- `dashboard-overview`: the Overview tab's traffic-light summary cards (data sourced
  from existing invoice/chase-allowance/promise state), the left-side
  Overview/Invoices/Resolved Invoices tab navigation structure at `/dashboard`, and
  the route split of the existing
  active/resolved invoice views into `/dashboard/invoices` and `/dashboard/resolved`.

### Modified Capabilities
- (none — no existing spec currently governs the dashboard invoice list or its routes)

## Impact

- **Affected code**: `app/dashboard/page.tsx` (split into `app/dashboard/page.tsx`
  Overview + `app/dashboard/invoices/page.tsx` + `app/dashboard/resolved/page.tsx`),
  a new `app/dashboard/layout.tsx` tab strip (or extension of the existing layout),
  a new overview summary component, `components/dashboard/UpgradeBanner.tsx` and
  `components/dashboard/LockedDashboardPreview.tsx` (link targets), any other code
  linking to `/dashboard?resolved=1` or `/dashboard?intent=...`.
- **No schema or RLS changes** — all summary data is derived from existing
  `TrackedInvoice`, `PromiseToPay`, and chase-allowance queries already run in
  `app/dashboard/page.tsx`.
- **No billing/plan changes** — no new `SubscriptionFeature` is introduced.
