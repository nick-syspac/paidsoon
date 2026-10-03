## 1. SEO Source Of Truth And Route Policy

- [x] 1.1 Inventory the canonical marketing, integration, blog, auth, onboarding, and dashboard routes that need indexability or `noindex` treatment.
- [x] 1.2 Extend the shared marketing content model so module destinations carry search-intent copy, canonical route, and legacy-alias metadata.
- [x] 1.3 Extend the shared integration catalog so publicly marketed integrations carry landing-page metadata, route, positioning copy, and supported-workflow summaries.
- [x] 1.4 Add shared metadata helpers for indexable marketing pages and non-indexable auth/application pages so route-level SEO policy is not page-local.

## 2. Commercial Page Search Repositioning

- [x] 2.1 Refresh homepage metadata, hero copy, and supporting sections to target invoice reminder and cash-flow search intent while preserving accurate private-beta messaging.
- [x] 2.2 Update the shared module page template and content so priority module destinations lead with business-problem and category-language positioning before branded module names.
- [x] 2.3 Choose and implement the canonical invoice reminder destination, update internal links to it, and add permanent redirect or canonical handling for legacy aliases such as `/paidsoon`.
- [x] 2.4 Refresh `/pricing` metadata and public price/offer messaging so page copy and structured data match the canonical plan catalog exactly.
- [x] 2.5 Refresh `/accountants` metadata and page structure so accountants and bookkeepers see current single-client value first and planned multi-client capability second.

## 3. Integration Landing Pages

- [x] 3.1 Create a shared provider landing-page component and route model for marketed integrations.
- [x] 3.2 Add dedicated landing pages for Xero, MYOB, Stripe, and CSV import with provider-specific setup, supported workflows, positioning, and CTA content.
- [x] 3.3 Update `/integrations`, homepage integration references, and other discovery surfaces to link available providers to their canonical landing pages.
- [x] 3.4 Add provider-specific metadata and comparison copy that explains how PaidSoon complements each provider rather than replacing it.

## 4. Editorial Content Publishing

- [x] 4.1 Add a repo-local blog content source under `content/blog` with required frontmatter for slug, title, description, author, reviewer, published date, updated date, and related commercial links.
- [x] 4.2 Implement blog article index and article detail routes with rendered article body content, visible authorship, and publication metadata.
- [x] 4.3 Publish an initial set of high-intent articles for the getting-paid cluster and link them to the canonical invoice reminder destination.
- [x] 4.4 Update `/resources`, `/blog`, and related commercial pages so published articles are discoverable through internal linking rather than placeholder-only listings.

## 5. Technical SEO Assets And Structured Data

- [x] 5.1 Replace deploy-time sitemap timestamps with registry-driven canonical sitemap generation using meaningful `lastModified` values for marketing pages, integration pages, and articles.
- [x] 5.2 Expand structured data on the homepage and relevant commercial pages with Organization, WebSite, SoftwareApplication or Product, Offer, Breadcrumb, and Article schema only where the visible content supports it.
- [x] 5.3 Add dedicated Open Graph and Twitter preview images or route-specific social preview assets for the homepage and priority commercial pages.
- [x] 5.4 Apply `noindex` metadata consistently to sign-in, sign-up, forgot-password, reset-password, onboarding, and authenticated application pages that should not appear in search results.
- [x] 5.5 Verify `robots.txt`, sitemap output, canonicals, and redirect behavior all point to the same public route inventory.

## 6. Validation And Rollout Safety

- [x] 6.1 Run `openspec validate improve-marketing-site-seo --type change --strict` and resolve any proposal/spec/design/task issues.
- [x] 6.2 Run targeted project validation for the implementation change set, including lint, build, and any relevant automated tests.
- [x] 6.3 Manually verify metadata, social previews, redirects, sitemap entries, and `noindex` behavior for homepage, invoice reminder, pricing, accountants, Xero, MYOB, sign-in, and one published article.
- [x] 6.4 Manually verify internal linking from homepage to module pages, integrations, pricing, accountants, blog index, and article detail pages on desktop and mobile.