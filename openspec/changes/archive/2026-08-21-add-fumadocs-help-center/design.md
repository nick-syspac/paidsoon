## Context

`/help` (`app/(marketing)/help/page.tsx`) is a single static Server Component: six hardcoded
paragraphs under "Getting started" and a six-item "Common tasks" bullet list, wrapped by the
shared `(marketing)` layout (`MarketingNav` + `MarketingFooter`). There is no content model, no
search, and every edit is a code change + PR + deploy.

Separately, `app/(marketing)/docs/page.tsx` is a similar static placeholder aimed at a *future*
developer/API audience (webhooks, public API — none of which exist yet). `docs/*.md` at the repo
root (DDD, HLD, runbooks) is the internal engineering source-of-truth corpus. Neither of those is
touched by this change.

Fumadocs (`fumadocs-core` + `fumadocs-mdx` + optionally `fumadocs-ui`) is a content framework
purpose-built for exactly the `/help` problem: MDX-authored pages, generated navigation/page tree,
built-in static search, content inclusion for shared snippets. Its current framework-mode install
guide lists Next.js 16 and Tailwind CSS 4 as prerequisites — this repo is already on both
(`package.json`: `next@^16.2.9`, `tailwindcss@^4`), so no framework upgrade is required to adopt
it.

Stakeholders: marketing/support own the content; engineering owns the integration shell and must
keep it from leaking into the rest of the app (dashboard, admin, auth all share `app/layout.tsx`).

## Goals / Non-Goals

**Goals:**
- Replace the static `/help` page with an MDX-authored, searchable help center covering only
  features that are actually shipped today.
- Keep the existing marketing chrome (`MarketingNav`/`MarketingFooter`) around the help content,
  rather than adopting fumadocs' full opinionated docs shell wholesale.
- Avoid touching the app's shared root layout (`app/layout.tsx`) — fumadocs' `RootProvider` must
  be scoped under `/help` only, since `app/layout.tsx` is rendered by every route in the app
  (dashboard, admin, auth, billing), and this change has no reason to touch any of them.
- Ship 8 tutorials that map 1:1 to real, shipped capabilities (Xero connect, MYOB connect, invoice
  import, reminder sequence setup, dispute pause, promise-to-pay, reminder exclusion, dashboard
  metrics/collection performance).
- Establish a repeatable authoring template so future tutorials are additions to `content/help/`,
  not new React components.

**Non-Goals:**
- Do not migrate `features`, `accountants`, `integrations`, or any new marketing page
  (`industries`, `comparisons`) onto the fumadocs content source. Only `/help` moves.
- Do not build the `approval_mode` or weekly-debtor-summary tutorials — those features don't
  exist (`UNIMPLEMENTED_FEATURES` in `lib/subscriptionPlans.ts`). Backlogged, not built here.
- Do not build the `/docs` developer/API documentation surface. Left as-is.
- Do not add authentication/gating to `/help` — it stays fully public, like today.
- Do not adopt a third-party search service (Algolia etc.) — fumadocs' built-in Orama-based static
  search is sufficient at this content scale.

## Decisions

### 1. Fumadocs MDX (`fumadocs-mdx`) as the content source, not a headless CMS
Content lives in-repo at `content/help/**/*.mdx`, versioned in git alongside the code it
describes, reviewed via normal PRs. Rejected a headless CMS (Contentful/Sanity) because it would
add a new external dependency, a new secret (API token), and a second place for support/marketing
to learn — all before there's evidence the authoring volume needs it. In-repo MDX matches how
`docs/*.md` and every other content-ish thing in this codebase already works.

### 2. `fumadocs-ui` dropped entirely; `fumadocs-core` (headless) only, no `RootProvider`
Fumadocs' quickstart wraps the target route in `fumadocs-ui`'s `<DocsLayout>` (full sidebar +
topbar, replacing all surrounding chrome) and requires `<RootProvider>` to be mounted in the real
root layout (`fumadocs-ui`'s own docs: *"It should be located at the root layout"* — it renders
`<html>`/`<body>`-scoped theme/search-dialog/hotkey context via `next-themes` and a
`FrameworkProvider`, and is not designed to nest under a route subtree).

**Resolved during implementation** (this was flagged as an open risk before coding started, and
confirmed against fumadocs-ui's own docs): since `app/layout.tsx` is the one shared root layout
rendered by every route in this app (dashboard, admin, auth, billing, all of marketing),
adopting `RootProvider` would mean every page in the app depends on `fumadocs-ui` and
`next-themes`, contradicting this change's non-goal of leaving the shared app shell untouched.
Decision: **drop `fumadocs-ui` as a dependency entirely.** Use only `fumadocs-core` (content
loader, page-tree generation, static search) plus hand-written Tailwind-styled components:
- `helpSource.getPageTree()` (from `fumadocs-core/source`) drives a small hand-rolled sidebar
  component, styled with the repo's existing Tailwind classes — no `DocsLayout`.
- MDX bodies render through custom `components/help/mdx.tsx` overrides (headings, code blocks,
  a `Callout` component) rather than `fumadocs-ui/mdx`'s `defaultMdxComponents`, since several of
  those components assume a `RootProvider` context is present.
- Search UI is a plain input/results list that calls `/api/help/search` with `fetch` — the search
  *route* still uses `fumadocs-core/search/server`'s `createFromSource` (a plain route handler,
  no React context dependency), only the *UI* is hand-rolled instead of `fumadocs-ui`'s search
  dialog.
- The existing `MarketingNav`/`MarketingFooter` stay in place unchanged (rendered by
  `app/(marketing)/layout.tsx`), with the hand-rolled sidebar/content area rendering inside them.

Trade-off accepted: more UI code to write and maintain ourselves, in exchange for zero changes to
`app/layout.tsx` and no new provider dependency for the rest of the app.

### 3. `next.config.ts` stays TypeScript; convert to `.mjs` only if the native resolver fails
Fumadocs MDX's Next.js plugin (`createMDX` from `fumadocs-mdx/next`) is ESM-only and its own docs
recommend `next.config.mjs`. Next.js 16 supports a native Node.js TypeScript resolver for
`next.config.ts`. Decision: try wrapping the existing `next.config.ts` with `createMDX()` first
(preserving today's `serverExternalPackages` and `redirects()`); only fall back to renaming to
`next.config.mjs` if the native TS resolver rejects the ESM-only plugin. This is a task-time
verification, not a pre-decided rewrite, to minimize unrelated diff.

### 4. New `app/api/help/search/route.ts`, not reusing the shape of the fumadocs quickstart's `app/api/search/route.ts`
Named/scoped under `/api/help/` (rather than the quickstart's flat `/api/search`) to avoid
implying it covers app-wide search (it only searches `content/help/`), and to leave the path
clear if `/docs` ever gets its own separate search index later.

### 5. Content template with a `lastVerified` frontmatter field, enforced by convention not tooling
Each tutorial's frontmatter includes `lastVerified: YYYY-MM-DD`. No automated staleness check is
built in this change (e.g. a CI job failing builds after N days) — that's a reasonable follow-up
but out of scope; for now it's a documented authoring convention, consistent with keeping this
change focused on the fumadocs integration itself.

### 6. Tutorial scope: 8 of the original 10, gated on real features and real UI
`approval_mode` (tutorial "review and approve reminders") and the weekly debtor summary email
(tutorial "understand the weekly debtor summary") are excluded because neither feature exists in
the codebase (confirmed: `UNIMPLEMENTED_FEATURES` in `lib/subscriptionPlans.ts`, and
`openspec/changes/migrate-scheduled-jobs-to-railway-celery/tasks.md`'s note that no
weekly-debtor-summary feature exists anywhere). A third topic, "exclude a customer or invoice from
reminders," was also dropped during implementation: `providerMetadata.automationExcluded` is a
real field in the data model, but grepping the dashboard/API code found **no customer-facing UI
control** that sets it — only seed data, direct DB edits, or inferred accounting-sync metadata can.
Documenting any of these as real tutorials would repeat the exact mistake already flagged for the
pricing page in `openspec/changes/restore-three-tier-pricing/design.md`. All three are backlog
items, to be written when (and only when) their underlying feature/UI ships. The 8th tutorial slot
is filled by "manually resolve an invoice," a real, verified bulk action in
`components/dashboard/InvoiceTable.tsx` (`Resolve` → `Confirm resolve`).

Separately, the "pause reminders for a dispute" tutorial was renamed to "pause reminders on an
invoice": the actual shipped control (`components/dashboard/InvoiceTable.tsx` bulk action bar) is a
generic `Pause`/`Resume` toggle with no dispute-specific reason field, despite some existing
marketing/FAQ copy (`app/(marketing)/faq/page.tsx`) describing it as "mark the invoice as
disputed." The tutorial describes the real generic mechanism and notes disputes as a common reason
to use it, rather than implying a dispute-labeled mode that doesn't exist — the same accuracy
principle applied to the excluded topics above.

## Risks / Trade-offs

- **ESM-only plugin vs. `next.config.ts`** → Mitigation: attempt native TS resolver first (Next 16
  supports it); documented fallback to `.mjs` if it fails, scoped to task 1 so it's resolved early
  and doesn't block the rest of implementation.
- **Tailwind 4 CSS-first config + fumadocs-ui's prebuilt CSS imports could visually clash with the
  existing marketing design tokens** (fumadocs ships its own color/spacing presets via
  `fumadocs-ui/css/*.css`) → Mitigation: import fumadocs' base CSS but override its CSS custom
  properties to match the existing Tailwind theme, or skip `fumadocs-ui`'s CSS entirely and only
  use its unstyled/headless primitives with hand-written Tailwind classes (decision 2's fallback
  path covers this).
- **`RootProvider` may have hidden assumptions about being mounted at the true document root**
  (e.g. for `<html>`/`<body>` attributes like `suppressHydrationWarning`, or theme flash
  prevention) → Mitigation: verify in a local dev build early (task-level spike) before writing
  all 8 tutorials; if `RootProvider` genuinely requires root-layout placement, escalate back to
  proposal-level scope discussion rather than silently expanding blast radius to `app/layout.tsx`.
- **Fumadocs MDX content pipeline runs at build/dev-server-start time** (parses `content/help/`
  into a typed collection) → adds a small amount to `next build`/`next dev` startup; acceptable at
  8-tutorial scale, revisit if the corpus grows to hundreds of pages.
- **New dependency surface**: `fumadocs-mdx`, `fumadocs-core`, `fumadocs-ui`, `@types/mdx` are new
  packages not previously in `package.json` → Mitigation: MIT-licensed, no runtime secrets, and
  per `copilot-instructions.md`'s "never introduce a new provider/package without documenting why"
  rule, that justification lives in proposal.md's Impact section.

## Migration Plan

1. Install dependencies, wire `source.config.ts` + `next.config.ts`, confirm `next dev` boots.
2. Build the scoped layout shell (`app/(marketing)/help/layout.tsx` with nested `RootProvider`,
   `app/(marketing)/help/[[...slug]]/page.tsx`) rendering a single placeholder MDX page, verify it
   renders inside the existing `MarketingNav`/`MarketingFooter` with no visual regression to other
   `(marketing)` routes.
3. Wire `app/api/help/search/route.ts`, confirm search returns results for the placeholder page.
4. Delete `app/(marketing)/help/page.tsx` (the old static page) once the new route serves `/help`.
5. Author the 8 tutorials in `content/help/`, migrating the real content from the old
   `page.tsx`'s "Getting started"/"Common tasks" sections where it's still accurate, expanding
   each into the full tutorial template.
6. No rollback complexity beyond a normal revert — no database/schema changes, no data migration,
   purely additive route + content changes plus one file deletion.

## Open Questions

- Should `content/help/` support an `<include>`-based shared-snippets directory
  (e.g. `content/help/_shared/dispute-pausing.mdx`) from the start, or only introduce it the first
  time two tutorials actually need the same explanation? (Leaning: introduce on first real
  duplication, per YAGNI — avoid speculative abstraction per this repo's implementation-discipline
  conventions.)
- Should `/help`'s old URL structure (a single page) redirect anywhere, or is `/help` becoming a
  multi-page section (e.g. `/help/xero`, `/help/myob`) a fine breaking change for what's presumably
  low-traffic, pre-public-launch content? (Leaning: fine to break, `LIVE` gate means the product
  isn't fully public yet per `lib/liveMode.ts`.)
