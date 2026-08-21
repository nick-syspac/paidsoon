## 1. Shared data-loading helper

- [x] 1.1 Extract the shared "load profile + connection + chase allowance" block
      from `app/dashboard/page.tsx` into a reusable helper (e.g.
      `lib/dashboard/loadDashboardContext.ts`), covering: `userProfile`,
      `invoiceConnection`, `getChaseAllowanceStatus`, and the trace-context
      plumbing currently inline in `page.tsx`.
- [x] 1.2 Add a second helper (or extend the first) that loads invoices by
      status bucket (`activeStatuses` / `resolvedStatuses`) with the same
      `include` shape (`emailLogs`, `promisesToPay`, `arrangementCoverages`)
      currently in `page.tsx`.
- [x] 1.3 Add a helper that computes `brokenByDebtor`
      (`buildBrokenPromiseCountsByDebtor`) and `heldInvoiceIds`, reusing the
      existing logic verbatim from `page.tsx`.

## 2. Overview tab (`/dashboard`)

- [x] 2.1 Add pure severity-derivation functions for the four cards (Overdue,
      Chase allowance, Broken promises, Held invoices) per the rules in
      `design.md` Decision 2, in a new `lib/dashboard/overviewCards.ts` (or
      similar), taking already-loaded data as input (no DB calls).
- [x] 2.2 Add a `components/dashboard/OverviewCards.tsx` component rendering
      the four cards with green/yellow/red severity styling and each card's
      underlying count/amount.
- [x] 2.3 Add click-through links from each card to `/dashboard/invoices` with
      a filter query param (e.g. `?filter=broken_promises`, `?filter=held`,
      `?filter=overdue`).
- [x] 2.4 Rewrite `app/dashboard/page.tsx` to use the helpers from Section 1,
      compute card severities via 2.1, and render `OverviewCards` — remove the
      `InvoiceTable` rendering and the `resolved`/`intent` query-param handling
      from this route.
- [x] 2.5 Add the legacy-link redirect: `/dashboard?resolved=1` →
      `/dashboard/resolved` (see design.md Risk #1).

## 3. Invoices tab (`/dashboard/invoices`)

- [x] 3.1 Add `app/dashboard/invoices/page.tsx` using the Section 1 helpers,
      querying `activeStatuses`, rendering `InvoiceTable` exactly as `/dashboard`
      does today (same props: `invoices`, `showResolved={false}`,
      `brokenPromiseCountsByDebtor`, `escalationThreshold`, `heldInvoiceIds`).
- [x] 3.2 Support the `?filter=` query param from card click-throughs (2.3) to
      pre-filter the rendered table client-side (no new server query variants).
- [x] 3.3 Move the chase-allowance usage line and `UpgradeBanner` (near-limit /
      at-capacity) rendering from the old `/dashboard` page into this route.
- [x] 3.4 Move the "Connect Stripe" nudge link and `LockedDashboardPreview`
      fallback (for any tier without `overdue_invoice_dashboard`, defensive only
      per design.md context) into this route.

## 4. Resolved Invoices tab (`/dashboard/resolved`)

- [x] 4.1 Add `app/dashboard/resolved/page.tsx` using the Section 1 helpers,
      querying `resolvedStatuses`, rendering `InvoiceTable` with
      `showResolved={true}`, matching today's `?resolved=1` behavior.
- [x] 4.2 Move the `LockedDashboardPreview` fallback for
      `payment_status_dashboard` (defensive only per design.md context) into
      this route.

## 5. Tab navigation

- [x] 5.1 Add a left-side vertical tab navigation (Overview / Invoices /
      Resolved Invoices) to `app/dashboard/layout.tsx`, laid out as a two-column
      shell (nav rail on the left, page content on the right), with active-tab
      highlighting based on the current pathname. Collapse to a horizontal or
      compact control on small screens.

## 6. Update internal deep links

- [x] 6.1 Update `components/dashboard/UpgradeBanner.tsx` and
      `components/dashboard/LockedDashboardPreview.tsx` link targets from
      `/dashboard` / `/dashboard?resolved=1` / `/dashboard?intent=...` to the
      new `/dashboard/invoices` / `/dashboard/resolved` routes.
- [x] 6.2 Search the codebase for any other internal links to
      `/dashboard?resolved=1` or `/dashboard?intent=` and update them.

## 7. Tests

- [x] 7.1 Update or split existing dashboard tests
      (`tests/dashboard-arrangement-state.test.ts`, `tests/dashboard-tracing.test.ts`,
      `tests/dashboard-upsell.test.ts`) to match the new route structure.
- [x] 7.2 Add unit tests for the four severity-derivation functions
      (`lib/dashboard/overviewCards.ts`), covering the green/yellow/red
      scenarios listed in `specs/dashboard-overview/spec.md`.
- [x] 7.3 Run `npm run test` and fix any failures introduced by the route split.

## 8. Documentation

- [x] 8.1 Update `docs/DDD.md` to reflect the new `/dashboard`,
      `/dashboard/invoices`, and `/dashboard/resolved` routes (dashboard/UI
      section), replacing references to the old single-route dashboard.
