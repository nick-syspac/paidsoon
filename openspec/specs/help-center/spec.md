# help-center Specification

## Purpose
TBD - created by archiving change add-fumadocs-help-center. Update Purpose after archive.
## Requirements
### Requirement: MDX-authored help content source
The help center SHALL be authored as MDX files under `content/help/`, loaded through a fumadocs
content source (`fumadocs-mdx`), rather than hardcoded in React components. Adding or editing a
tutorial SHALL require only an MDX file change, not a change to route or layout code.

#### Scenario: Adding a new tutorial requires no component changes
- **WHEN** a new `.mdx` file with valid frontmatter (`title`, `description`) is added under
  `content/help/`
- **THEN** the tutorial is served at its corresponding `/help/<slug>` route and appears in the
  help center's navigation without any edits to `app/(marketing)/help/**` route files

#### Scenario: Missing required frontmatter fails the build
- **WHEN** an `.mdx` file under `content/help/` is missing the required `title` field
- **THEN** the content build SHALL fail with an error identifying the offending file, rather than
  silently rendering a page with no title

### Requirement: Help center scoped shell, isolated from the rest of the app
The help center SHALL render inside the existing `(marketing)` route group's shared chrome
(`MarketingNav`, `MarketingFooter`), and any fumadocs provider/context required for its UI
(search dialog, theme) SHALL be scoped to a layout nested under `/help`. The application's root
layout (`app/layout.tsx`) SHALL NOT be modified by this capability.

#### Scenario: Non-help routes are unaffected
- **WHEN** a user visits `/dashboard`, `/admin`, `/auth/callback`, or any other `(marketing)`
  route such as `/pricing`
- **THEN** those routes render exactly as they did before this change, with no fumadocs
  provider, script, or style dependency loaded on their render path

#### Scenario: Help pages still show marketing nav and footer
- **WHEN** a user visits any `/help/<slug>` page
- **THEN** the page SHALL display the same `MarketingNav` and `MarketingFooter` shown on other
  marketing pages (e.g. `/pricing`, `/features`)

### Requirement: Built-in static search over help content
The help center SHALL expose a search endpoint that indexes only `content/help/` MDX content and
returns results without depending on a third-party search service.

#### Scenario: Search returns a matching tutorial
- **WHEN** a user searches the help center for a term that appears in a published tutorial's
  title, description, or body
- **THEN** that tutorial SHALL appear in the search results

#### Scenario: Search does not surface unrelated app content
- **WHEN** a user searches the help center
- **THEN** results SHALL be limited to `content/help/` pages only — dashboard data, admin data,
  or other marketing pages outside `/help` SHALL NOT appear in results

### Requirement: Tutorials cover only shipped capabilities
Each published tutorial SHALL describe a capability that is implemented and enabled in the
codebase (verifiable against `lib/subscriptionPlans.ts` feature flags or equivalent shipped
behavior) as of its `lastVerified` date. A tutorial SHALL NOT be published for a capability listed
in `UNIMPLEMENTED_FEATURES`.

#### Scenario: Publishing a tutorial for an unimplemented feature is rejected
- **WHEN** a tutorial's content describes a capability that is present in
  `UNIMPLEMENTED_FEATURES` (e.g. `approval_mode`, `weekly_summary_email`)
- **THEN** the tutorial SHALL NOT be included in the published help center content set

#### Scenario: Every published tutorial has a last-verified date
- **WHEN** a tutorial is published under `content/help/`
- **THEN** its frontmatter SHALL include a `lastVerified` date field

### Requirement: Standard tutorial template
Every tutorial SHALL follow a consistent structure: what the tutorial accomplishes, before-you-
start prerequisites, numbered steps, what the customer should see, what happens next, common
problems, a related-tutorial link, and a last-verified date.

#### Scenario: A tutorial missing a required section is flagged in review
- **WHEN** a new tutorial MDX file omits one of the required template sections (e.g. no
  "Common problems" heading)
- **THEN** it SHALL be identifiable as non-conformant during content review (e.g. via a template
  checklist), so the standard structure stays consistent across tutorials

