## Purpose

Define a complete, conversion-focused marketing website that clearly positions PaidSoon as a four-module financial control platform for Australian small businesses and turns visitors into qualified signup starts.

## ADDED Requirements

### Requirement: Homepage SHALL communicate platform value within first viewport
The system SHALL render a homepage that communicates the platform category, primary customer problem, and primary conversion action above the fold, and SHALL make the four modules discoverable without requiring a second page visit.

#### Scenario: Visitor lands on homepage
- **WHEN** a new visitor opens `/`
- **THEN** the page SHALL show one clear H1 describing the platform outcome, a concise supporting statement, a primary CTA, and a secondary lower-commitment CTA.

#### Scenario: Visitor scans first homepage sections
- **WHEN** a new visitor scrolls through the first major homepage sections
- **THEN** the page SHALL include a summary of PaidSoon, SpendLeak, CostGuard, and CashPlan with distinct module roles and links to each module page.

### Requirement: Marketing IA SHALL include dedicated module pages and platform overview
The system SHALL provide dedicated marketing pages for each module and SHALL provide a platform-overview narrative that explains how modules work together in one operating cycle.

#### Scenario: User navigates product menu
- **WHEN** a visitor opens Product navigation on desktop or mobile
- **THEN** navigation SHALL expose links to `/paidsoon`, `/spendleak`, `/costguard`, `/cashplan`, platform overview, pricing, and integrations.

#### Scenario: User reads module page
- **WHEN** a visitor opens any module page
- **THEN** the page SHALL include module-specific problem framing, capabilities, workflow explanation, outcomes, cross-module context, FAQ, and at least one primary CTA.

### Requirement: Platform narrative SHALL position PaidSoon as complementary to accounting systems
Marketing messaging SHALL distinguish record/report accounting systems from PaidSoon control workflows, and SHALL frame the four modules as one coordinated financial control system.

#### Scenario: Visitor reads platform positioning section
- **WHEN** a visitor reads the platform positioning content
- **THEN** the copy SHALL state that accounting software reports what happened and PaidSoon helps control what happens next.

#### Scenario: Visitor reviews module relationship
- **WHEN** a visitor reads the module relationship section
- **THEN** the flow SHALL map PaidSoon to receivables action, SpendLeak to waste review, CostGuard to ongoing cost monitoring, and CashPlan to forward cash planning.

### Requirement: CTA architecture SHALL be consistent and conversion-focused
The system SHALL use one consistent primary conversion term across major marketing pages and SHALL present conversion opportunities at key decision points.

#### Scenario: Visitor navigates major marketing pages
- **WHEN** a visitor views homepage, module pages, platform page, and pricing
- **THEN** each page SHALL provide a clearly visible primary CTA above the fold and at least one additional CTA near the end of the page.

#### Scenario: User follows CTA to signup/billing flow
- **WHEN** a visitor selects a primary CTA
- **THEN** the CTA destination SHALL resolve to an existing, functioning route in the current product signup or billing flow.

### Requirement: Marketing pages SHALL meet baseline SEO, accessibility, and performance standards
All core marketing pages SHALL ship with unique metadata, semantic heading structure, and accessible navigation controls while preserving responsive performance.

#### Scenario: Search metadata is rendered
- **WHEN** a crawler or browser inspects a marketing page
- **THEN** the page SHALL provide a unique title, unique meta description, canonical metadata, and Open Graph metadata.

#### Scenario: Keyboard and screen-reader navigation
- **WHEN** a keyboard-only or assistive-technology user navigates the marketing layout
- **THEN** all primary navigation controls, mobile menu controls, and CTA controls SHALL expose accessible names and visible focus states.

#### Scenario: Responsive rendering
- **WHEN** a visitor opens a core marketing page on mobile viewport and desktop viewport
- **THEN** content SHALL remain readable without horizontal overflow and primary CTA/navigation interactions SHALL remain usable.
