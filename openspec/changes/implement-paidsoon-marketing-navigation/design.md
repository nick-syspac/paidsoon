## Context

PaidSoon currently has two standalone public pages (`/` and `/pricing`), each with their own inline nav — a `<nav>` element baked directly into the page component. There is no shared public layout, no footer, no company/legal pages, and no structured marketing navigation hierarchy. The dashboard section already uses a shared `app/dashboard/layout.tsx`. The `app/layout.tsx` root layout handles global fonts, analytics, and the pre-launch banner — it is not the right place for marketing navigation.

All marketing pages must be publicly accessible regardless of `LIVE` mode. The existing middleware's `shouldBlockAuthEntry` guard only applies to auth-entry paths (`/sign-in`, `/sign-up`). New marketing routes do not need middleware changes — but this must be verified during implementation.

The `NEXT_PUBLIC_COMPANY_ABN` environment variable allows the ABN to be configured per-environment (preview vs. production) without code changes.

## Goals / Non-Goals

**Goals:**
- Introduce a shared marketing layout group (`app/(marketing)/`) with a persistent `MarketingNav` and `MarketingFooter`
- Create all 21 public marketing pages as Next.js App Router Server Components
- Ensure all pages have unique `generateMetadata` titles and descriptions
- Make the ABN configurable via `NEXT_PUBLIC_COMPANY_ABN`
- Keep the implementation additive — no changes to auth flow, API, or database

**Non-Goals:**
- Fully-written legal page copy (placeholder content with legal-review notices is sufficient)
- Blog CMS or dynamic content management for blog/release notes
- Contact form backend / email delivery (form can submit to a placeholder or TODO endpoint)
- Accountant partner portal or dashboard functionality
- Annual/monthly pricing toggle on `/pricing`
- Team seat or multi-client functionality
- Any changes to the dashboard, auth, or billing subsystems

## Decisions

### D1 — Route group `app/(marketing)/` for shared public layout

All marketing routes are placed under `app/(marketing)/` using Next.js App Router route groups. The group provides a shared `layout.tsx` that renders `MarketingNav` + `{children}` + `MarketingFooter` without affecting URL paths.

**Why a route group over the root layout:** The root `app/layout.tsx` is shared with `/dashboard`, `/onboarding`, and auth pages — none of which should show the marketing nav/footer. A route group neatly scopes the shared chrome to only marketing pages.

**Existing pages to migrate:** `app/page.tsx` (homepage) and `app/pricing/page.tsx` both become `app/(marketing)/page.tsx` and `app/(marketing)/pricing/page.tsx` respectively. The existing files at the non-grouped paths take precedence in Next.js routing over grouped paths, so the existing files must be moved (not duplicated).

**Alternative considered:** Wrapping individual pages manually with a `<MarketingLayout>` component. Rejected — more boilerplate, less idiomatic, misses the Suspense/`loading.tsx` benefit of the layout boundary.

### D2 — `MarketingNav` as a Server Component with `"use client"` mobile menu sub-component

The nav is primarily static links. It can be a Server Component. The only interactive part is the mobile hamburger toggle — this is extracted into a `MobileMenuToggle` (or `MobileNav`) `"use client"` component. The rest of the nav renders server-side.

**Why not make the whole nav `"use client"`:** Server Components reduce JS bundle size and are SEO-friendlier. The nav links themselves don't require client-side interactivity.

### D3 — `MarketingFooter` as a pure Server Component

The footer contains only static links and text. No interactivity needed. Pure Server Component.

### D4 — ABN via `NEXT_PUBLIC_COMPANY_ABN` environment variable

The ABN is rendered in the footer Trust section. It must be configurable per-environment. `NEXT_PUBLIC_*` variables are inlined at build time in Next.js and are safe for non-sensitive display data like a company ABN.

Default fallback: `"ABN: [PLACEHOLDER — configure NEXT_PUBLIC_COMPANY_ABN]"` so the footer renders clearly even without the env var set.

**Alternative considered:** A `siteConfig.ts` constant file. Acceptable but less flexible across preview/production environments. The env var approach is consistent with PaidSoon's existing pattern for per-environment config.

### D5 — Contact form as a `"use client"` component with a TODO backend

The contact form collects name, email, enquiry type, and message. For the initial implementation, it submits to a `/api/contact` placeholder route that returns `501 Not Implemented` with a JSON body `{ "error": "Contact form not yet implemented" }`. The form shows a success/error state client-side. This keeps the page functional enough for testing without requiring a real email or CRM integration.

**Alternative considered:** Linking to a mailto: address. Rejected — not professional for a SaaS product and doesn't support enquiry type selection.

### D6 — Placeholder legal and content pages use a `PlaceholderPage` Server Component

Legal pages (`/privacy`, `/terms`, `/cookies`, `/security`, `/acceptable-use`) and content stubs (`/blog`, `/help`, `/docs`, `/roadmap`, `/release-notes`, `/careers`) use a shared `PlaceholderPage` component that renders a clear "placeholder" banner and a brief description of the page's intent. This avoids repeating the same boilerplate across 10+ files.

**Why not just a single catch-all route:** Each page needs its own `generateMetadata` with a unique title/description for correct SEO metadata. Individual `page.tsx` files are required.

### D7 — `Start Free Trial` CTA routes to `/pricing`

Consistent with the existing hero CTA pattern in `app/page.tsx`. The primary acquisition funnel is: marketing page → `/pricing` → `/sign-up` → onboarding. The CTA does not bypass pricing.

### D8 — Integrations page accurately labels availability

The integrations displayed are: MYOB (coming soon — no integration implemented), Xero (coming soon — no integration implemented), QuickBooks (coming soon), Stripe Connect (implemented). The Stripe Connect integration is the only one currently live. All others are explicitly labelled "Coming soon" to avoid false advertising.

**Source of truth:** `lib/providers/` and `app/api/integrations/` for which providers are actually implemented.

## Risks / Trade-offs

- **Route migration risk** (`app/page.tsx` → `app/(marketing)/page.tsx`): Moving the existing homepage and pricing page into the `(marketing)` route group requires deleting the current files and creating new ones. If a file at `app/page.tsx` and `app/(marketing)/page.tsx` both exist, Next.js will throw a build conflict. **Mitigation**: Delete old files before creating new grouped ones; test locally with `next build` before merging.
- **`NEXT_PUBLIC_COMPANY_ABN` not set in existing environments**: The fallback placeholder string ensures the footer renders without crashing. **Mitigation**: Add the env var to the `docs/runbooks/README.md` env matrix; document it in the tasks.
- **Contact form with `501` response**: May confuse users if they attempt to use it before the backend is implemented. **Mitigation**: The form UI clearly states "Coming soon — contact support@paidsoon.com.au directly" below the submit button.
- **Placeholder legal pages in production**: If `LIVE=true` is set before real legal copy is in place, users see placeholder content. **Mitigation**: Legal pages include a prominent `[PLACEHOLDER — requires professional legal review before production launch]` banner. The go-live runbook should require replacing placeholder legal copy.
- **Mobile nav accessibility**: Interactive mobile menu must be keyboard-navigable and use correct ARIA attributes (`aria-expanded`, `aria-controls`, `aria-label`). **Mitigation**: Use semantic HTML (`<button>`, `<nav>`, `role="navigation"`) and include a focus-trap for the open mobile menu.

## Migration Plan

1. Create `components/marketing/MarketingNav.tsx` and `components/marketing/MarketingFooter.tsx`
2. Create `app/(marketing)/layout.tsx` using the new components
3. Move `app/page.tsx` → `app/(marketing)/page.tsx` (delete original after verifying move)
4. Move `app/pricing/page.tsx` → `app/(marketing)/pricing/page.tsx` (delete original after verifying move)
5. Create all remaining marketing page files
6. Create `app/api/contact/route.ts` placeholder (returns `501`)
7. Add `NEXT_PUBLIC_COMPANY_ABN` to `.env.local` example and `docs/runbooks/README.md`
8. Run `next build` locally to verify no route conflicts or type errors
9. Run `npm run test` to confirm no regressions
10. Verify all new routes return 200 and are publicly accessible in both `LIVE=true` and `LIVE=false` modes

Rollback: All changes are purely additive (new files) except the homepage/pricing migration. The migration is reversible by moving files back to their original paths.

## Open Questions

- **Contact form destination**: Should form submissions eventually go to Resend, a CRM (HubSpot/Zoho), or a Supabase table? The placeholder `501` route leaves this open. Recommendation: decide before go-live.
- **Blog/docs platform**: Will `/blog`, `/docs`, and `/help` eventually be served from a headless CMS (Contentful, Sanity) or a docs platform (Mintlify, GitBook)? The current placeholder pages should include a `<!-- TODO: replace with CMS/docs platform integration -->` comment.
- **Accountant partner programme**: Is there a referral or white-label offering planned? The `/accountants` page includes a partner CTA that links to `/contact?type=partnership` — the actual programme details are TBD.
