## ADDED Requirements

### Requirement: Placeholder pages SHALL render a visible placeholder notice
Each placeholder page (`/about`, `/careers`, `/roadmap`, `/blog`, `/help`, `/docs`, `/faq`, `/release-notes`) SHALL render a prominent banner or callout indicating that the page is a placeholder with content coming soon. The notice SHALL be clearly visible without scrolling.

#### Scenario: Placeholder notice is visible on /about
- **WHEN** a visitor loads `/about`
- **THEN** a placeholder notice is visible near the top of the page

#### Scenario: Placeholder notice is visible on /blog
- **WHEN** a visitor loads `/blog`
- **THEN** a placeholder notice is visible near the top of the page

#### Scenario: Each placeholder page responds with 200 OK
- **WHEN** a visitor or crawler requests any placeholder route
- **THEN** the server responds with HTTP 200 (not 404 or 500)

### Requirement: Placeholder pages SHALL have unique page metadata
Each placeholder page SHALL export `generateMetadata` returning a unique `title` and `description` relevant to the page's intended content.

#### Scenario: /about has unique title
- **WHEN** the about page is rendered server-side
- **THEN** the `<title>` tag contains a unique about-specific title distinct from the homepage title

#### Scenario: /careers has unique title
- **WHEN** the careers page is rendered server-side
- **THEN** the `<title>` tag contains a unique careers-specific title

### Requirement: Placeholder pages SHALL contain a brief description of their intended purpose
Each placeholder page SHALL include at least a heading and a sentence or two explaining what content will eventually appear on the page.

#### Scenario: /faq includes intended purpose
- **WHEN** a visitor loads `/faq`
- **THEN** a heading and descriptive text indicating this page will contain frequently asked questions is visible
