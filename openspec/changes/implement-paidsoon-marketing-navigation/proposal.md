## Why

PaidSoon currently has a single landing page (`/`) and a `/pricing` page with minimal navigation — just "Sign in" and "View plans". There is no public marketing website, no footer, no company or legal pages, and no structured navigation hierarchy. Before acquiring customers at scale, PaidSoon needs a full public marketing presence: a structured top navigation, a rich footer, and all standard marketing and legal pages that a credible Australian SaaS product requires.

## What Changes

- **New shared public layout** (`app/(marketing)/layout.tsx`) that wraps all public marketing pages with a consistent `MarketingNav` header and `MarketingFooter` footer.
- **New top navigation** with: Home, Features, Pricing, How It Works, For Accountants, Resources, Contact, Log In, and Start Free Trial (primary CTA).
- **New footer** with five link groups: Company, Product, Resources, Legal, Trust (including Syspac Pty Ltd ownership, ABN, copyright notice, LinkedIn).
- **New marketing pages** (Server Components, no auth required):
  - `/features` — full feature breakdown
  - `/how-it-works` — step-by-step workflow
  - `/accountants` — accountant/bookkeeper partner page
  - `/resources` — hub linking to blog, help, docs, FAQ, release notes
  - `/contact` — contact form with sales/support/partnership enquiry types
  - `/about` — company story, team, Syspac Pty Ltd
  - `/careers` — open roles placeholder
  - `/integrations` — MYOB, Xero, QuickBooks, Stripe (with "Coming soon" labels where unimplemented)
  - `/roadmap` — public product roadmap placeholder
  - `/blog` — blog index placeholder
  - `/help` — help centre placeholder
  - `/docs` — documentation hub placeholder
  - `/faq` — frequently asked questions
  - `/release-notes` — changelog/release notes placeholder
  - `/privacy` — Privacy Policy (placeholder, requires legal review)
  - `/terms` — Terms of Service (placeholder, requires legal review)
  - `/cookies` — Cookie Policy (placeholder, requires legal review)
  - `/security` — Security practices page (placeholder)
  - `/acceptable-use` — Acceptable Use Policy (placeholder, requires legal review)
- **Updated homepage** (`app/page.tsx`) migrated into the marketing layout with expanded sections: hero, problem, solution, how-it-works preview, feature highlights, integrations, pricing preview, trust, FAQ preview, final CTA.
- **Updated `/pricing` page** migrated into the marketing layout (plans updated: Starter $19/mo, Business $49/mo, Accountant Partner — Contact us).
- **Per-page `<head>` metadata** (`generateMetadata`) with unique titles and descriptions on every page.
- **ABN** configurable via `NEXT_PUBLIC_COMPANY_ABN` environment variable.

## Capabilities

### New Capabilities

- `marketing-navigation`: Shared public marketing header (`MarketingNav`) and footer (`MarketingFooter`) rendered on all public marketing routes via a shared layout group.
- `marketing-homepage`: Expanded homepage with hero, problem/solution, how-it-works preview, feature highlights, integrations, pricing preview, trust, FAQ preview, and final CTA sections.
- `marketing-features-page`: Dedicated `/features` page explaining PaidSoon's automation, reminders, promise-to-pay, disputes, debtor dashboard, reports, accountant visibility, branding, and audit trail.
- `marketing-how-it-works-page`: `/how-it-works` page explaining the end-to-end workflow from accounting integration to debtor summary.
- `marketing-accountants-page`: `/accountants` page targeting bookkeepers and accountants with client management, visibility, partner program, and partnership CTA.
- `marketing-pricing-page`: Updated `/pricing` page with revised plan tier names, prices, and comparison table, inside the shared marketing layout.
- `marketing-contact-page`: `/contact` page with a contact form supporting sales, support, and partnership enquiry types.
- `marketing-resources-page`: `/resources` hub page linking to blog, help, docs, FAQ, and release notes.
- `marketing-integrations-page`: `/integrations` page listing supported and coming-soon accounting/payment integrations.
- `marketing-placeholder-pages`: Lightweight placeholder pages for `/about`, `/careers`, `/roadmap`, `/blog`, `/help`, `/docs`, `/faq`, `/release-notes`.
- `marketing-legal-pages`: Placeholder legal pages for `/privacy`, `/terms`, `/cookies`, `/security`, `/acceptable-use`, clearly marked as requiring professional legal review.

### Modified Capabilities

- `live-mode-auth-gating`: All new `/` (marketing) routes must be publicly accessible regardless of `LIVE` mode. The existing `shouldBlockAuthEntry` logic already allows non-auth-entry paths; confirming new routes are not inadvertently blocked is part of implementation verification.

## Impact

- **New files**: `app/(marketing)/layout.tsx`, `components/marketing/MarketingNav.tsx`, `components/marketing/MarketingFooter.tsx`, and one `page.tsx` per new route (21 pages total).
- **Modified**: `app/page.tsx` — expanded homepage content, migrated into marketing layout group.
- **Modified**: `app/pricing/page.tsx` — migrated into marketing layout group, plan details updated.
- **Modified**: `components/pricing/PricingCTA.tsx` — no structural change needed; plan IDs remain compatible.
- **New environment variable**: `NEXT_PUBLIC_COMPANY_ABN` (optional; defaults to a placeholder string if absent).
- **No auth flow changes**, no API changes, no database changes, no middleware changes.
- All new pages are public Server Components — no Supabase auth context required.
- The `Log In` nav link routes to `/sign-in` (existing route).
- The `Start Free Trial` CTA routes to `/pricing` (consistent with existing hero CTA pattern).
