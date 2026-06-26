## ADDED Requirements

### Requirement: Legal pages SHALL render with a prominent legal-review disclaimer
Each legal page (`/privacy`, `/terms`, `/cookies`, `/security`, `/acceptable-use`) SHALL display a clearly visible banner or callout stating that the content is placeholder material and requires professional legal review before production use.

#### Scenario: Legal review disclaimer is visible on /privacy
- **WHEN** a visitor loads `/privacy`
- **THEN** a disclaimer banner stating the content is placeholder and requires legal review is visible near the top

#### Scenario: Legal review disclaimer is visible on /terms
- **WHEN** a visitor loads `/terms`
- **THEN** a disclaimer banner is visible near the top

#### Scenario: Each legal page responds with 200 OK
- **WHEN** a visitor or crawler requests any legal route
- **THEN** the server responds with HTTP 200

### Requirement: Legal pages SHALL contain placeholder structured content
Each legal page SHALL contain a heading matching the page title and a brief placeholder body with section stubs (e.g., Data Collection, User Rights, Contact Information for `/privacy`) to indicate the intended structure. Placeholder text SHALL clearly indicate it is not legally binding.

#### Scenario: /privacy contains section stubs
- **WHEN** a visitor loads `/privacy`
- **THEN** at least two section headings relevant to a privacy policy are visible (e.g., "What data we collect", "Your rights")

#### Scenario: /terms contains section stubs
- **WHEN** a visitor loads `/terms`
- **THEN** at least two section headings relevant to terms of service are visible

### Requirement: Legal pages SHALL reference Syspac Pty Ltd as the operating entity
Each legal page SHALL identify the operating entity as "Syspac Pty Ltd" in the placeholder content.

#### Scenario: Syspac Pty Ltd is referenced on /privacy
- **WHEN** a visitor reads the privacy policy page
- **THEN** "Syspac Pty Ltd" is mentioned as the data controller or operating entity

### Requirement: Legal pages SHALL have unique page metadata
Each legal page SHALL export `generateMetadata` returning a unique `title` and `description`.

#### Scenario: /privacy has a unique title
- **WHEN** the privacy page is rendered server-side
- **THEN** the `<title>` tag contains "Privacy Policy" or equivalent text
