## Why

`/help` is currently a single hardcoded `page.tsx` with six static paragraphs and a bullet list of
"common tasks" — it isn't searchable, isn't structured as task-oriented tutorials, and every edit
requires a code change and deploy. As PaidSoon adds more real capability (accounting integrations,
promise-to-pay, dispute pausing, dashboard metrics) the help center needs to grow into dozens of
outcome-based tutorials without becoming an unmaintainable pile of JSX. Fumadocs (MDX content
source + search + sidebar navigation) is designed for exactly this, and this repo already meets
its stated prerequisites (Next.js 16, Tailwind CSS 4) with no version upgrades required.

This is customer/business-owner-facing help content — separate from `docs/*.md` (the internal
engineering source-of-truth corpus: DDD, HLD, runbooks) and separate from `/docs` (the existing
placeholder for a future *developer*/API documentation surface, out of scope here).

## What Changes

- Add `fumadocs-mdx` + `fumadocs-core` + `fumadocs-ui` and wire up a `content/help/` MDX content
  source, replacing the static `app/(marketing)/help/page.tsx` with a fumadocs-powered route.
- Introduce a dedicated docs-style shell (sidebar + table of contents + built-in search) for the
  `/help` section, scoped so it does not alter the shared marketing chrome (`MarketingNav`/
  `MarketingFooter`) used by every other `(marketing)` route, and does not require wrapping the
  application's real root `app/layout.tsx` in fumadocs' `RootProvider` — that provider is scoped to
  a layout nested under `/help` only.
- Add a static search API route (`app/api/help/search/route.ts`, Orama-based, no third-party
  search service) scoped to the help content source only.
- Author 8 outcome-based tutorials as MDX, using a consistent template (goal, before-you-start,
  numbered steps, what happens next, common problems, related tutorial, "last verified" date):
  connect to Xero, connect to MYOB, import outstanding invoices, configure a reminder sequence,
  pause reminders on an invoice, record a promise to pay, manually resolve an invoice, and read
  the dashboard's collection metrics.
- Use fumadocs MDX `<include>` for content genuinely shared across tutorials (e.g. the "how
  dispute pausing works" explanation referenced from both the Xero and MYOB tutorials), not as a
  general-purpose templating mechanism.
- **Explicitly out of scope**: three tutorial topics from the original outcome list are deferred:
  "review and approve reminders" and "understand the weekly debtor summary" (neither
  `approval_mode` nor a weekly-summary email exists in the codebase — both are tracked as
  unimplemented in `lib/subscriptionPlans.ts` / `UNIMPLEMENTED_FEATURES`), and "exclude a customer
  or invoice from reminders" (confirmed during implementation: `providerMetadata.automationExcluded`
  exists in the data model but has **no customer-facing UI control at all** — it can currently only
  be set via seed data, direct DB access, or inferred accounting-sync metadata). Documenting any of
  these now would repeat the existing pricing-page accuracy gap already flagged in
  `openspec/changes/restore-three-tier-pricing/design.md`. All three become backlog tutorials,
  gated on the underlying feature/UI shipping. The 8th tutorial slot is filled instead by
  "manually resolve an invoice" (a real bulk action — `Resolve` → `Confirm resolve` — in
  `components/dashboard/InvoiceTable.tsx`).
- **Explicitly out of scope**: migrating other marketing pages (`features`, `accountants`,
  `integrations`, or new `industries`/`comparisons` pages) onto the fumadocs content source. This
  change touches `/help` only.
- **Explicitly out of scope**: the `/docs` developer/API documentation placeholder — left
  untouched.

## Capabilities

### New Capabilities
- `help-center`: MDX-authored, searchable customer help center at `/help`, backed by fumadocs,
  covering real (shipped) PaidSoon workflows only, with a documented process for adding new
  tutorials as features ship.

### Modified Capabilities
- None. No existing `openspec/specs/` capability currently governs `/help` (it has been a static
  marketing page with no tracked spec).

## Impact

- **Dependencies added**: `fumadocs-mdx`, `fumadocs-core`, `@types/mdx` (all MIT-licensed, no
  runtime secrets/credentials involved). `fumadocs-ui` was evaluated but dropped — its
  `RootProvider` is documented as required in the application's real root layout, which conflicts
  with keeping this change scoped to `/help` only (see design.md decision 2). Sidebar, MDX
  rendering, and search UI are hand-rolled with `fumadocs-core`'s headless data (page tree, search
  index) instead.
- **Config**: `next.config.ts` gains the `fumadocs-mdx` Next.js plugin wrapper (`createMDX`) —
  fumadocs MDX is ESM-only, so this needs verifying against Next 16's native TypeScript config
  resolver, or `next.config.ts` may need to become `next.config.mjs`. A new `source.config.ts` at
  repo root defines the MDX collection.
- **New code**: `lib/help/source.ts` (fumadocs loader), `app/(marketing)/help/layout.tsx` +
  `app/(marketing)/help/[[...slug]]/page.tsx` (replacing the current `help/page.tsx`),
  `app/api/help/search/route.ts`, `components/help/mdx.tsx` (MDX component overrides styled to
  match PaidSoon's existing design tokens rather than fumadocs' default theme).
  `content/help/**/*.mdx` for the 8 tutorials plus an index/landing page.
  `globals.css` gains fumadocs' Tailwind CSS imports (`fumadocs-ui/css/*.css`), scoped to be
  compatible with the existing Tailwind 4 CSS-first config (no `tailwind.config.js` in this repo).
- **Removed**: `app/(marketing)/help/page.tsx` (the static placeholder).
- **No changes** to auth, billing, RLS, database schema, or any `/dashboard` or `/api` route
  outside the new `app/api/help/search` endpoint (which serves only static MDX-derived content,
  no user data).
