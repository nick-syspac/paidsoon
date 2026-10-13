# Tasks

## 1. Shared marketing catalog and platform copy

- [x] 1.1 Update the shared marketing catalog with the requested customer-facing names and canonical `/features/` paths for all ten existing modules; preserve internal IDs and availability data, and verify every name/path pair with focused Node tests.
- [x] 1.2 Add Client Manager to public feature discovery only for verified per-client accountant/bookkeeper workflows, keeping multi-client features explicitly planned; verify catalog/navigation output and ensure no plan or entitlement identifiers change.
- [x] 1.3 Update homepage, platform overview, feature overview, navigation, footer, CTAs, pricing comparisons, FAQs, and public supporting copy contextually so PaidSoon remains the platform and InvoiceGuard names the invoice-follow-up module; verify key public labels and pillar placement with focused content tests/search review.
- [x] 1.4 Align the homepage hero with financial control for Australian businesses, explain FinOps in plain language, include InvoiceGuard's verified introductory description, preserve mode-aware trial/early-access conversion behavior, and link “Explore the features” to `/features`; verify hero content, CTA destinations, and mobile layout.

## 2. Canonical feature destinations

- [x] 2.1 Add statically rendered canonical feature pages for all catalog-backed descriptive slugs using the shared marketing presentation and module-specific content; verify each route renders meaningful initial HTML, one H1, a problem, verified capabilities, benefits, and a next action.
- [x] 2.2 Create `/features/client-manager` using only verified single-client capabilities and the existing accountant enquiry action, with multi-client dashboard, client onboarding, and unlimited-client features marked planned; verify the page makes no present-tense multi-client claims.
- [x] 2.3 Update all internal feature links, breadcrumbs, cards, related-module links, and accountant references to canonical destinations while preserving `/features` and `/platform` as overview routes; verify every link resolves without entering a legacy redirect.

## 3. Redirects and SEO consistency

- [x] 3.1 Add direct permanent server-side redirects from `/paidsoon` and `/invoiceguard` to `/features/invoiceguard`, and from `/spendleak`, `/costguard`, `/cashplan`, `/deposit-guard`, `/tax-buffer`, `/commitguard`, `/margin-guard`, `/runway-guard`, `/owners-digest`, and `/accountants` to their mapped canonical destinations; verify each source returns 301 or 308 with no chain or loop and representative query parameters are preserved.
- [x] 3.2 Update affected titles, descriptions, absolute canonicals, Open Graph/Twitter URLs, image descriptions, and structured data to match visible copy and the verified production hostname; verify each canonical page has unique metadata and platform-level PaidSoon structured data stays intact.
- [x] 3.3 Update route registries and sitemap generation to list canonical feature URLs once and omit redirected sources; add tests that compare catalog destinations, canonicals, redirects, and sitemap entries, then verify all use `https://www.paidsoon.com.au` in production.

## 4. Validation and release readiness

- [x] 4.1 Audit public marketing references to PaidSoon and InvoiceGuard in context, all mapped customer-facing labels, spelling variants, public URLs, conversion links, and supported capability claims; record any external CMS content that cannot be changed from this repository. No external CMS content source is present in the repository.
- [ ] 4.2 Run the relevant automated tests, `npm run lint`, `npx tsc --noEmit`, and `npm run build`; verify product, billing, internal IDs, permissions, and authenticated routes have no unintended changes.
- [x] 4.3 Smoke-test every canonical feature route and legacy redirect, compare canonical/social URLs with sitemap entries, and review homepage, navigation, pricing, and representative feature pages at mobile and desktop widths for readability and keyboard accessibility.