## Why

PaidSoon's marketing site is technically crawlable, but its current search footprint is limited because the public pages are still positioned around internal product names, the blog is only a placeholder index, and several SEO controls remain too generic to help Google understand page intent. We need a focused SEO foundation pass now so the site can compete for non-brand searches around invoice reminders, cash-flow forecasting, recurring expense control, and accountant workflows before broader content and authority work begins.

## What Changes

- Reposition priority commercial pages around recognized search problems and software categories instead of leading with internal module names alone.
- Add dedicated search landing pages for key integrations and commercial intents, including separate Xero and MYOB pages instead of relying on one generic integrations page.
- Introduce a real editorial content model for blog articles, including article detail routes, article metadata, article schema, and sitemap inclusion.
- Strengthen technical SEO controls: route-level canonical handling, stable redirects for ambiguous legacy marketing URLs, meaningful sitemap `lastModified` values, and consistent `noindex` treatment for auth and application pages.
- Expand structured data and social metadata so the homepage and core commercial pages expose Organization, WebSite, SoftwareApplication/Product, Breadcrumb, and article context where supported by visible content.
- Align internal linking between homepage, module pages, integration pages, pricing, accountants, and blog content so commercial pages and supporting educational content reinforce each other.

## Capabilities

### New Capabilities
- `marketing-technical-seo-controls`: Defines canonical URL handling, redirect expectations for legacy marketing URLs, sitemap freshness rules, page-level indexation controls, and required social/structured metadata on public marketing and auth surfaces.
- `marketing-editorial-content`: Defines how PaidSoon publishes blog articles with stable URLs, route metadata, article schema, authorship/dates, internal linking, and sitemap inclusion.
- `marketing-integration-landing-pages`: Defines dedicated public landing pages for individual integrations and comparison-ready integration messaging that distinguishes provider-specific setup and value.

### Modified Capabilities
- `marketing-module-portfolio-pages`: Changes module destination requirements so public module pages lead with search-recognized business problems, customer outcomes, and category language before branded module terminology.
- `marketing-accountant-partner-page`: Expands `/accountants` requirements to target both accountants and bookkeepers with current-value copy, search-led metadata, and partner-service positioning without overstating unimplemented multi-client functionality.
- `integration-availability-signaling`: Extends integration messaging requirements from status consistency alone to include integration-specific landing-page discovery, internal linking, and copy that differentiates PaidSoon from native provider reminder tooling.
- `subscription-plan-tiers`: Tightens public pricing requirements so pricing metadata, plan messaging, and any structured offer data remain consistent with the live catalog and current public prices.

## Impact

- Affected routes in `app/(marketing)/`, `app/sitemap.ts`, `app/robots.ts`, auth page metadata in `app/(auth)/`, and shared marketing components/utilities under `components/marketing/` and `lib/`.
- New marketing routes for integration detail pages and blog article pages, plus redirects from legacy or ambiguous marketing URLs where required.
- No billing, auth, or database behavior changes beyond metadata/indexation treatment on public and auth-facing pages.
- Follow-on content work will still be needed for domain authority, but this change establishes the technical and information-architecture foundation required for those future articles and landing pages to rank.