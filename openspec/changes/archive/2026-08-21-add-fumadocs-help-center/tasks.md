## 1. Dependencies and content pipeline setup

- [x] 1.1 Add `fumadocs-mdx`, `fumadocs-core`, `@types/mdx` to `package.json` — `fumadocs-ui` was
      also added initially but later removed (task 2.2) once `RootProvider`'s root-layout
      requirement was confirmed to conflict with keeping this change scoped to `/help`
- [x] 1.2 ~~Create `source.config.ts`~~ — not needed: fumadocs-mdx's Next.js "Framework Mode"
      (the guide matching this repo's exact Next 16 + Tailwind 4 versions) defines collections via
      `defineDocs` from `fumadocs-mdx/macro` directly inside `lib/help/source.ts` (task 2.1); a
      standalone `source.config.ts` is only needed for collection-level remark/mdx customization,
      which isn't required since `.mdx` files support `<include>` natively
- [x] 1.3 Wrap `next.config.ts` with `createMDX()` from `fumadocs-mdx/next`; verify Next 16's
      native TypeScript config resolver accepts the ESM-only plugin — if it does not, convert to
      `next.config.mjs` and confirm existing `serverExternalPackages` and `redirects()` still work
      — **confirmed working**: `next dev` booted cleanly with `next.config.ts` unchanged (no
      `.mjs` conversion needed)
- [x] 1.4 Confirm `npm run dev` and `npm run build` both succeed with an empty/placeholder
      `content/help/index.mdx` — dev boots cleanly; `next build` compiles + type-checks
      successfully, then fails later at `/api/admin/staff/invitations` due to a pre-existing
      missing `RESEND_API_KEY` in this environment, unrelated to this change

## 2. Scoped route shell (no root layout changes)

- [x] 2.1 Create `lib/help/source.ts` (fumadocs `loader()` wired to the `content/help/` source)
- [x] 2.2 **Revised** (see design.md decision 2): `fumadocs-ui`'s `RootProvider` is documented as
      required in the real root layout, conflicting with keeping this change scoped to `/help`.
      Dropped `fumadocs-ui` entirely — `app/(marketing)/help/layout.tsx` renders a hand-rolled
      sidebar (from `helpSource.pageTree`) with no fumadocs provider; `app/layout.tsx` untouched
- [x] 2.3 Create `app/(marketing)/help/[[...slug]]/page.tsx` rendering pages from the content
      source, with `generateStaticParams`/`generateMetadata` per fumadocs' pattern
- [x] 2.4 Create `components/help/mdx.tsx` with hand-written MDX component overrides (headings,
      code blocks, a `Callout` component) styled with the repo's existing Tailwind classes —
      no `fumadocs-ui/mdx` import (its `defaultMdxComponents` assume a `RootProvider` context)
- [x] 2.5 ~~Add fumadocs' required CSS imports to `globals.css`~~ — not needed: no `fumadocs-ui`
      CSS is used; MDX content is styled entirely with this repo's existing Tailwind classes
- [x] 2.6 Manually verify: `/dashboard`, `/admin`, `/auth/callback`, `/pricing`, and one other
      `(marketing)` route render unchanged (no new script/style/provider on their render path)
      — confirmed via curl: dashboard/admin/auth/callback return 307 (auth redirect, expected,
      unchanged), `/pricing` returns 200
- [x] 2.7 Manually verify: `/help` renders inside the existing `MarketingNav`/`MarketingFooter`
      — confirmed via curl: rendered HTML contains the marketing nav and `<footer>`

## 3. Search

- [x] 3.1 Create `app/api/help/search/route.ts` using `fumadocs-core`'s `createFromSource`,
      scoped to the `content/help/` source only
- [x] 3.2 Wire the help center's search UI (fumadocs-ui search dialog or a custom trigger) to call
      `/api/help/search` — built as a hand-rolled `components/help/HelpSearch.tsx` (client
      component using `fumadocs-core/search/client`'s `useDocsSearch`/`fetchClient`), consistent
      with dropping `fumadocs-ui` (design.md decision 2)
- [x] 3.3 Verify a search for a term in a placeholder tutorial's title/body returns that result,
      and that no non-help content appears in results — confirmed via curl:
      `/api/help/search?query=getting` returns the index page and its "Getting started" heading

## 4. Cut over from the static page

- [x] 4.1 Confirm the new `/help` route (with placeholder content) is live and serving correctly
- [x] 4.2 Delete `app/(marketing)/help/page.tsx`

## 5. Author the 8 tutorials

- [x] 5.1 Write the standard tutorial frontmatter/template (title, description, lastVerified,
      before-you-start, numbered steps, what happens next, common problems, related tutorial)
      as a reference/example MDX file — established via the pattern used consistently across all
      8 tutorials below (no separate empty template file; each tutorial follows the same shape)
- [x] 5.2 "Connect PaidSoon to Xero" tutorial
- [x] 5.3 "Connect PaidSoon to MYOB" tutorial (note early-access status per existing `/docs` copy)
- [x] 5.4 "Import your outstanding invoices" tutorial
- [x] 5.5 "Configure your first reminder sequence" tutorial
- [x] 5.6 "Pause reminders on an invoice" tutorial (generic `Pause`/`Resume` bulk action in
      `components/dashboard/InvoiceTable.tsx` — no dispute-specific control exists; note disputes
      as a common reason to use it, per design.md decision 6)
- [x] 5.7 "Record a promise to pay" tutorial
- [x] 5.8 "Manually resolve an invoice" tutorial (real `Resolve` → `Confirm resolve` bulk action
      in `components/dashboard/InvoiceTable.tsx`; replaces "exclude a customer or invoice," which
      has no shipped UI — see design.md decision 6)
- [x] 5.9 "Read your dashboard's collection metrics" tutorial (measuring whether follow-ups work)
- [x] 5.10 Migrate any still-accurate copy from the old `help/page.tsx` (e.g. billing update task,
       manual-resolve task) into the relevant new tutorial(s) or a help center index page —
       the billing pointer and support-contact copy moved into the new `content/help/index.mdx`
- [x] 5.11 Cross-link tutorials via "related tutorial" per the template, and confirm relative MDX
       links resolve correctly through the content source — verified via curl (all 8 tutorial
       routes plus the index return 200)

## 6. Verification

- [x] 6.1 Run `npm run lint` and `npx tsc --noEmit` — confirm no new errors — lint clean after
      ignoring fumadocs-mdx's generated `.source/` directory (added to `.gitignore` and
      `eslint.config.mjs`, analogous to `.next/`); `tsc --noEmit` shows only the two pre-existing,
      previously-documented test-fixture failures, unrelated to this change
- [x] 6.2 Run `npm run test` — confirm no regressions (no existing test currently covers
      `app/(marketing)/help`, so none should need updating, but confirm) — 463/463 pass, 0 fail
- [x] 6.3 Manually verify every one of the 8 tutorials against the currently deployed product to
      confirm accuracy before setting each `lastVerified` date — verified against the current
      source code directly (exact route paths, button/label copy, and gating logic grepped and
      read from `app/`, `components/`, and `lib/subscriptionPlans.ts`) rather than a live
      deployment, since none is reachable from this sandbox; `lastVerified: 2026-08-02` reflects
      that code-level verification
- [x] 6.4 Confirm the three deferred tutorials (approval/review flow, weekly debtor summary,
      exclude a customer/invoice) are not present anywhere in `content/help/` or linked from the
      help center navigation — confirmed via grep: no matches for those topics in `content/help/`
