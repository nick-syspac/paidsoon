## Purpose

Define a complete, conversion-focused marketing website that clearly positions PaidSoon as a financial-control platform for Australian small businesses, makes all ten product modules discoverable through four customer outcomes, and turns visitors into qualified signup starts.

## ADDED Requirements

### Requirement: Homepage SHALL communicate platform value within first viewport
The system SHALL render a homepage that positions PaidSoon as financial control software for Australian small businesses, communicates its broader financial-control value and primary conversion action above the fold, and makes the four outcomes and relevant product areas discoverable.

#### Scenario: Visitor lands on homepage
- **WHEN** a new visitor opens `/`
- **THEN** the page SHALL show one benefit-led H1 about controlling spending and cash flow, concise copy explaining that PaidSoon helps Australian businesses control spending, protect cash flow, and make better financial decisions, a primary CTA appropriate to the active signup mode, and a secondary “See how it works” CTA.

#### Scenario: Visitor scans the homepage outcomes
- **WHEN** a new visitor scrolls through the first major homepage sections
- **THEN** the page SHALL explain “control costs”, “stop waste”, “get paid”, and “plan ahead” as outcomes before naming their supporting modules, and SHALL link to relevant product information.

### Requirement: Homepage SHALL explain FinOps and organize the product story around visitor needs
The homepage SHALL explain FinOps in plain English and connect financial problems to verified PaidSoon capabilities and practical outcomes without presenting invoice follow-ups as the whole product.

#### Scenario: Visitor needs a definition of FinOps
- **WHEN** a visitor encounters the FinOps description
- **THEN** the page SHALL explain that it brings spending, payments, and cash-flow information together so a business owner can make better financial decisions.

#### Scenario: Visitor compares the four financial-control outcomes
- **WHEN** a visitor reads the outcome section
- **THEN** the page SHALL cover controlling costs, reviewing recurring waste, following up overdue invoices, and planning for commitments or cash pressure, using only capabilities and availability supported by the product.

#### Scenario: Visitor follows a three-step workflow
- **WHEN** a visitor reads “How it works”
- **THEN** the page SHALL describe bringing in supported financial data, reviewing available financial-control information, and taking an action, while distinguishing supported imports/integrations and plan-dependent modules.

### Requirement: Homepage SHALL use verified, useful content and a single clear conversion path
Homepage copy, visuals, pricing references, integration statements, and conversion prompts SHALL be accurate to the current product and visible content, with unverified claims omitted or explicitly marked for review.

#### Scenario: Visitor sees a product visual or proof statement
- **WHEN** a product visual or trust statement is rendered
- **THEN** it SHALL depict an actual product interface or make a factual statement supported by current implementation, and SHALL NOT fabricate customer evidence, metrics, certifications, savings, or guarantees.

#### Scenario: Visitor follows a homepage CTA
- **WHEN** the visitor selects a primary CTA in the active signup mode
- **THEN** every primary CTA on the homepage SHALL use the same wording and route to the working signup or early-access destination for that mode, while “See how it works” SHALL lead to a useful walkthrough.

#### Scenario: Visitor reviews pricing or asks about product fit
- **WHEN** a visitor reads the pricing pathway, integration copy, or FAQs
- **THEN** the page SHALL link to current plan details and relevant product/integration pages, identify planned capabilities as planned, and make no claim that exceeds the current plan, integration, or trial configuration.

### Requirement: Homepage SHALL provide people-first search and accessibility foundations
The homepage SHALL use crawlable, accessible content and unique search metadata that accurately represents the financial-control offer without promising search ranking outcomes.

#### Scenario: Search engine or browser reads homepage metadata
- **WHEN** a crawler or browser inspects `/`
- **THEN** it SHALL receive a unique title and description targeting financial control software for Australian small businesses, one H1, logical headings, canonical metadata, and structured data that matches visible content.

#### Scenario: Visitor navigates the homepage on mobile or with assistive technology
- **WHEN** a visitor views the homepage on a small screen or navigates it using keyboard or assistive technology
- **THEN** content and CTAs SHALL remain usable, images SHALL have meaningful alternative text, and any sticky CTA SHALL NOT obscure page content or controls.

### Requirement: Marketing IA SHALL include all product modules and a platform overview
The system SHALL make all ten product modules discoverable and provide dedicated marketing pages plus a platform overview explaining their distinct and connected roles.

#### Scenario: User navigates product menu
- **WHEN** a visitor opens Product navigation on desktop or mobile
- **THEN** navigation SHALL expose links to `/invoiceguard`, `/deposit-guard`, `/spendleak`, `/owners-digest`, `/costguard`, `/commitguard`, `/margin-guard`, `/cashplan`, `/tax-buffer`, and `/runway-guard`, as well as platform overview, pricing, and integrations.

#### Scenario: User reads module page
- **WHEN** a visitor opens any module page
- **THEN** the page SHALL include module-specific problem framing, capabilities, workflow explanation, outcomes, cross-module context, FAQ, and at least one primary CTA.

#### Scenario: Visitor discovers the full platform
- **WHEN** a visitor browses the homepage or platform overview
- **THEN** all ten modules SHALL be discoverable through relevant descriptive links, while module availability and plan restrictions remain clear and accurate.

### Requirement: Platform narrative SHALL position PaidSoon as complementary to accounting systems
Marketing messaging SHALL distinguish record/report accounting systems from PaidSoon control workflows, and SHALL explain how its ten modules support four coordinated financial-control outcomes.

#### Scenario: Visitor reads platform positioning section
- **WHEN** a visitor reads the platform positioning content
- **THEN** the copy SHALL state that accounting software reports what happened and PaidSoon helps control what happens next.

#### Scenario: Visitor reviews module relationship
- **WHEN** a visitor reads the module relationship section
- **THEN** the page SHALL connect InvoiceGuard and DepositGuard to getting paid; SpendLeak to recurring-spend review; CostGuard, CommitGuard, and MarginGuard to cost, commitment, and margin control; CashPlan, Tax Buffer, and RunwayGuard to planning ahead; and Owner's Digest to cross-module financial visibility.

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
