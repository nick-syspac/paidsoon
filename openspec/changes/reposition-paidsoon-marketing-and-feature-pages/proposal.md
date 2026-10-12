# Proposal

## Why

PaidSoon's public site already presents a broader financial-control platform, but its module pages still use product-name URLs and several public labels and journeys need to align around one clear platform story. This change will make module names, descriptive URLs, redirects, marketing copy, and SEO signals consistent while preserving PaidSoon as the platform brand and avoiding claims for unfinished functionality.

## What Changes

- Position PaidSoon as financial-control and FinOps software for Australian businesses, with concise plain-language explanations and the four outcome pillars Get Paid, Control Costs, Plan Ahead, and Stop Waste.
- Use InvoiceGuard consistently for the invoice-follow-up module, including the plain-language introduction “InvoiceGuard — automated invoice follow-ups to help you get paid sooner.” Keep PaidSoon for the platform, company, subscription plans, and platform-wide legal content.
- Give public modules descriptive canonical paths under `/features/`, including the specified names and URL mapping; keep the portfolio overview and other established parent routes where they remain appropriate.
- Redirect discovered former module URLs directly and permanently to their canonical destinations, including both `/paidsoon` and `/invoiceguard` to `/features/invoiceguard`. Update shared module data, navigation, footer, cards, breadcrumbs, CTAs, pricing comparisons, FAQs, and public page copy to use canonical destinations.
- Refresh affected page titles, descriptions, canonical and social URLs, structured data, and sitemap entries. Keep redirect sources out of indexable route lists and preserve supported query parameters.
- Represent accountant/bookkeeper functionality as Client Manager only to the extent verified in the existing `/accountants` content; keep multi-client management and partner dashboard capabilities clearly marked as planned and retain the existing enquiry flow.
- Keep product identifiers, database fields, APIs, permissions, plan identifiers, authenticated routes, billing behavior, and platform-wide legal meaning unchanged. Do not invent capabilities, testimonials, integrations, or outcomes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `marketing-module-portfolio-pages`: update public module display names, dedicated canonical destinations, shared links, and module discovery behavior.
- `marketing/problem-first-journey`: align the platform hero, outcome pillars, module placement, and feature-exploration CTA with the approved financial-control positioning.
- `marketing-feature-claim-accuracy`: preserve truthful availability and capability language while changing public module naming and destinations.
- `marketing-accountant-partner-page`: represent the existing per-client accountant workflow under the Client Manager destination without presenting planned multi-client features as shipped.

## Impact

- Affected areas include `components/marketing/marketingContent.ts`, marketing navigation and page components under `app/(marketing)/`, `components/marketing/`, `lib/marketing/seo.ts`, `app/sitemap.ts`, and Next.js redirect configuration; focused marketing-route and redirect tests may be added.
- Existing product IDs such as `paidsoon`, product logic, checkout, and authenticated application routes remain untouched. Public marketing URLs change and require permanent redirects to avoid breaking existing links.
- Repository marketing content is code-defined; no external CMS source was found during discovery. Verify that no separately managed external content needs an update before release. Canonical hostname remains `https://www.paidsoon.com.au`.
- Main risks are missed stale public labels/links, redirect chains, canonical/sitemap disagreement, accidental changes to the PaidSoon brand, and overstating the not-yet-implemented multi-client partner experience. No schema, data, or billing migration is intended.