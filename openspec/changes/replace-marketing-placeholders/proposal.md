## Why

The PaidSoon marketing website currently contains placeholder pages, `[PLACEHOLDER]` blocks, and draft-warning text across 15+ public routes. Visitors — including potential customers, accountants, and partners — see amber "Coming soon" banners and `[PLACEHOLDER]` strings on legal, help, and content pages, undermining credibility and preventing a clean private-beta launch. The site needs production-ready draft content before wider outreach begins.

## What Changes

- Replace 8 pages using `<PlaceholderPage>` with full prose content: `about`, `blog`, `careers`, `docs`, `faq`, `help`, `release-notes`, `roadmap`
- Fill inline `[PLACEHOLDER]` sections in 5 legal/policy pages: `privacy`, `terms`, `cookies`, `security`, `acceptable-use`
- Remove "not legally binding" and `[PLACEHOLDER …]` warning strings from legal pages; replace with "Draft — pending legal review" framing
- Replace `[see footer]` ABN reference in `privacy/page.tsx` with the literal ABN `12 657 226 125`
- Update private-beta banner in `app/layout.tsx` from "This site is not live yet. Sign in and sign up are currently disabled." to the private-beta message
- Update `integrations/page.tsx`: change MYOB status from "Coming soon" to "Planned"; rename MYOB to "MYOB Business"; update description; rename QuickBooks to "QuickBooks Online"
- Update `accountants/page.tsx`: replace "details TBA" with real partner benefit copy
- Update `contact/page.tsx`: change "Book a demo →" to "Request a demo →" and point to `/contact?type=demo`
- Update `MarketingNav.tsx` and homepage hero CTA from "Start Free Trial" to "Request early access" linking to `/contact` (beta-appropriate; to be reverted when `LIVE=true` is set for production)
- Hardcode ABN fallback in `MarketingFooter.tsx` so ABN renders even if `NEXT_PUBLIC_COMPANY_ABN` is not set
- Delete `PlaceholderPage` component once all usages are removed

## Capabilities

### New Capabilities

- `marketing-page-content`: Production-ready draft prose for all marketing pages (about, blog, careers, docs, faq, help, release-notes, roadmap, integrations, accountants, contact)
- `legal-page-content`: Draft policy content for privacy, terms, cookies, security, acceptable-use — all marked "pending legal review", no raw placeholders
- `private-beta-messaging`: Consistent private-beta framing across banner, nav CTA, and homepage hero

### Modified Capabilities

- `live-mode-auth-gating`: Banner text changes; CTA button behaviour in nav and homepage changes for beta state (no auth-gate logic changes)
- `landing-how-it-works-plan-gating`: Homepage integration status labels updated (no gating logic changes)

## Impact

- **Files changed**: ~18 `.tsx` files across `app/(marketing)/` and `components/marketing/`
- **Deleted**: `components/marketing/PlaceholderPage.tsx` (once unused)
- **No API, database, auth, billing, or email changes**
- **No new dependencies**
- **ABN**: hardcoded as `12 657 226 125` (Syspac Pty Ltd); all legal pages updated
- **Australian spelling** used throughout: authorised, programme, finalised
