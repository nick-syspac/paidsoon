## Context

See proposal.md for motivation. The current marketing site already uses Next.js metadata exports, a shared marketing layout, a shared module catalog in `components/marketing/marketingContent.ts`, and shared module-page rendering through `components/marketing/ModulePage.tsx`. However, key SEO behavior is still scattered or incomplete: `app/sitemap.ts` emits the same deploy-time `lastModified` for every URL, `/blog` is only a placeholder index with no article routes, `/integrations` is a single generic page, auth pages do not broadly declare `noindex`, and legacy/alias module URLs still coexist.

The repo already has `fumadocs-mdx` and a working content-loader pattern for `content/help` via `lib/help/source.ts`. That gives us an existing, low-risk path for publishing article content without adding a CMS or new dependencies. The marketing site also already centralizes some truth-sensitive copy in canonical helpers (`lib/subscriptionPlans.ts`, `lib/planPresentation.ts`, `lib/integrationsCatalog.ts`), so the SEO work should extend that pattern rather than introduce page-local copies.

## Goals / Non-Goals

**Goals:**
- Centralize canonical marketing SEO inputs so page titles, descriptions, canonicals, route aliases, and sitemap entries stay aligned.
- Reposition high-intent commercial pages around recognizable search categories while preserving the existing module-brand narrative.
- Add provider-specific integration landing pages and real article-detail publishing with crawlable URLs, route metadata, structured data, and internal-linking support.
- Apply a consistent `noindex` policy to auth, onboarding, and application pages that may remain crawlable.
- Keep the implementation inside existing Next.js, TypeScript, and MDX tooling already present in the repo.

**Non-Goals:**
- No billing, entitlement, or Stripe behavior changes.
- No new external CMS, database-backed content system, or third-party SEO package.
- No attempt to solve off-site authority, backlink acquisition, or Search Console operations in code.
- No mass rewrite of every help/docs page; this change is limited to marketing, integration, blog, and crawl-control surfaces.

## Decisions

### Decision 1: Extend the shared marketing content model instead of hand-editing page-local SEO strings
- Decision: Add search-intent fields to the shared marketing content layer for module pages and related product-discovery surfaces, including canonical route, legacy aliases, category phrase, search-led title/description variants, and supporting CTA copy.
- Rationale: The current `ModulePage` and `moduleMetadata()` already make the module catalog the natural control point. Extending that single source keeps search-led copy, internal links, and canonical routing consistent across homepage cards, navigation, module pages, and sitemap output.
- Alternatives considered:
- Edit each route's metadata and hero copy independently: rejected because it would recreate the drift the SEO change is trying to remove.
- Replace the current module catalog with a CMS now: rejected because it adds operational complexity without being required for the first SEO pass.

### Decision 2: Use static MDX-backed editorial content for blog articles
- Decision: Create a dedicated blog content source under `content/blog` using the existing `fumadocs-mdx` stack or an equivalent repo-local MDX loader pattern, with frontmatter for slug, title, description, author, reviewer, publication dates, tags, and related commercial destinations.
- Rationale: The repo already ships MDX tooling for help content, so article publishing can stay static, reviewable in git, and build-time discoverable for metadata and sitemap generation. This is the smallest path from a placeholder `/blog` page to real article URLs.
- Alternatives considered:
- Keep `/blog` as a static React list with hard-coded articles: rejected because it does not scale to article detail routes or reliable sitemap/metadata generation.
- Store articles in the database: rejected because there is no existing editorial DB model and this change does not need authoring infrastructure.

### Decision 3: Treat integrations as structured marketing destinations, not only status cards
- Decision: Keep provider status in the existing shared integration catalog, but add landing-page fields and a shared integration page component for Xero, MYOB, Stripe, and CSV import. The generic `/integrations` page becomes an index that links into provider pages instead of being the only destination.
- Rationale: Public integration copy needs provider-specific setup, workflows, and positioning, but availability state must still come from one source of truth. Structured page data plus a shared component keeps those two concerns together without repeating provider facts across multiple routes.
- Alternatives considered:
- Write bespoke provider pages with independent copy and metadata: rejected because availability/capability drift would return quickly.
- Leave integration detail to one combined page: rejected because it cannot target integration-specific searches such as Xero invoice reminders or MYOB overdue invoice follow-up.

### Decision 4: Centralize sitemap and indexation policy in explicit registries/helpers
- Decision: Replace the current sitemap's static array plus `new Date()` behavior with a builder that composes canonical URLs from route registries: static marketing routes, module routes, integration landing pages, and published article entries. Each registry entry carries or derives a meaningful `lastModified` value. Add a shared metadata helper for `noindex` pages so auth and onboarding routes opt out consistently.
- Rationale: The current sitemap sends an artificial freshness signal and cannot include article pages without manual duplication. Explicit registries make canonical inclusion auditable and avoid deploy-time timestamp churn. A shared `noindex` helper reduces the chance of missing one auth-facing route.
- Alternatives considered:
- Keep manual arrays and update them by hand: rejected because every new article or integration page would be another drift risk.
- Use `robots.txt` disallow rules alone for auth/application routes: rejected because crawl blocking is not enough when the requirement is non-indexability.

### Decision 5: Use explicit canonical redirects for legacy marketing aliases
- Decision: Choose a single canonical public route for each SEO-targeted destination and implement permanent redirect behavior for legacy aliases where appropriate, while keeping metadata and sitemap aligned to the canonical destination only.
- Rationale: The current coexistence of `/paidsoon` and `/invoiceguard` dilutes intent and makes internal linking inconsistent. Explicit redirect policy is clearer than leaving aliases live indefinitely with partial canonical tags.
- Alternatives considered:
- Retain multiple public aliases with canonical tags only: rejected because it keeps ambiguous internal-link choices and weaker user-facing URL semantics.
- Remove aliases without redirects: rejected because it would break existing internal or indexed links.

## Risks / Trade-offs

- [Risk] Search-led copy could overstate product scope or provider support. -> Mitigation: keep plan, integration, and availability claims sourced from existing canonical helpers and require visible-content parity with metadata/schema.
- [Risk] Adding article and integration routes expands the route inventory and sitemap surface quickly. -> Mitigation: drive inclusion from explicit published registries and validate route counts plus sitemap output before merge.
- [Risk] Permanent redirects can create link or analytics regressions if internal links are not updated at the same time. -> Mitigation: update nav/footer/module catalog links in the same change and verify the redirect targets in build-time/manual QA.
- [Risk] MDX article publishing introduces content-quality variance if fields are optional or inconsistently filled. -> Mitigation: define required frontmatter and fail fast during build for missing title/description/author/date fields.
- [Risk] Page-level `noindex` could be applied too broadly and suppress legitimate public pages. -> Mitigation: scope the helper to auth/onboarding/dashboard surfaces only and verify canonical marketing routes remain indexable.

## Migration Plan

1. Extend the shared marketing and integration content registries with canonical route, metadata, and search-intent fields.
2. Introduce shared metadata helpers for indexable public pages and `noindex` auth/application pages.
3. Replace the sitemap generator with registry-driven canonical URL assembly and stable `lastModified` sourcing.
4. Add provider-specific integration landing pages and update `/integrations` plus supporting links to point to them.
5. Add the blog content source, blog article routes, metadata/schema generation, and article-aware sitemap inclusion.
6. Rework the homepage, priority module pages, pricing, and `/accountants` to consume the new search-led content fields.
7. Add or refresh Organization, WebSite, SoftwareApplication/Product, Breadcrumb, and Article structured data only where matching visible content exists.
8. Implement and verify redirects for legacy marketing aliases, then update internal links and canonical references.
9. Run OpenSpec validation, then implementation-time lint/build/tests plus manual crawl-oriented checks on sitemap, metadata, redirects, and noindex surfaces.

Rollback strategy: revert the change as a unit. If a specific redirect or sitemap rule causes regressions, temporarily restore the previous route or exclude the affected landing page while keeping the rest of the content changes intact.

## Open Questions

None.