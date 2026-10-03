## Purpose

Define the public SEO and indexation rules for marketing, editorial, and auth-facing pages so search engines see the right canonical URLs, metadata, freshness signals, and exclusion directives.

## ADDED Requirements

### Requirement: Public marketing pages SHALL expose intent-specific metadata and social previews
Each canonical public marketing page SHALL publish a unique title, description, canonical URL, and social preview metadata aligned to that page's primary search intent rather than inheriting generic site-wide marketing copy. Core commercial pages SHALL also expose a dedicated social image or equivalent route-specific preview asset.

#### Scenario: Homepage metadata reflects commercial search intent
- **WHEN** a crawler or visitor requests the homepage metadata
- **THEN** the title, description, canonical URL, and social preview describe PaidSoon's invoice reminder and cash-flow value proposition rather than only generic financial-control language

#### Scenario: Commercial page metadata is distinct from homepage metadata
- **WHEN** a crawler compares the metadata for two different commercial pages such as the invoice reminder page and the cash-flow forecasting page
- **THEN** each page has a unique title and description aligned to its own search intent
- **AND** neither page reuses the homepage metadata verbatim

### Requirement: Sitemap output SHALL reflect canonical public content and meaningful freshness
The sitemap SHALL list canonical public marketing pages and published editorial pages only. Each entry's `lastModified` value SHALL represent a meaningful content change for that page and SHALL NOT be refreshed solely because the site was redeployed.

#### Scenario: Unchanged page keeps its previous freshness signal
- **WHEN** the site is redeployed without a content change to a canonical marketing page
- **THEN** that page's sitemap `lastModified` value does not change solely because of the deploy

#### Scenario: Published article appears in the sitemap
- **WHEN** a new public blog article is published
- **THEN** the sitemap includes the article's canonical URL with a `lastModified` value derived from the article's visible publication or update metadata

### Requirement: Auth and application entry pages SHALL declare non-indexability in page metadata
Any public or crawlable auth, onboarding, password-recovery, or authenticated application page SHALL expose `noindex` metadata at the page level, even if related paths are also restricted in `robots.txt`. The system SHALL NOT rely on crawler blocking alone for these pages.

#### Scenario: Sign-in page is crawlable but not indexable
- **WHEN** a crawler requests the `/sign-in` page
- **THEN** the page response includes metadata instructing crawlers not to index or follow it

#### Scenario: Password recovery flow is excluded from search results
- **WHEN** a crawler requests a password recovery or onboarding page that is publicly reachable
- **THEN** the page response includes metadata instructing crawlers not to index it

### Requirement: Legacy or ambiguous marketing URLs SHALL resolve to one canonical destination
When multiple public URLs represent the same marketing destination, the system SHALL designate one canonical destination and ensure alternate or legacy URLs redirect to it or declare that same canonical target consistently.

#### Scenario: Legacy invoice module alias resolves to the primary destination
- **WHEN** a visitor or crawler requests a legacy alias for the invoice reminder module
- **THEN** the response resolves to the designated canonical invoice reminder destination
- **AND** the canonical target is consistent across metadata, internal links, and sitemap output
