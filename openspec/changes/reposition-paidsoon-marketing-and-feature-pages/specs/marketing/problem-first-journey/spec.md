# Spec Delta

## MODIFIED Requirements

### Requirement: Homepage narrative SHALL follow a fixed problem-first sequence
The homepage SHALL present content in this sequence: problem, outcome, how it works, relevant modules, proof, pricing, and call to action. The sequence MUST avoid placing full architecture/module catalogs before the problem and outcome framing.

#### Scenario: Visitor lands on homepage
- **WHEN** a visitor loads the homepage from a cold session
- **THEN** the first major sections follow the prescribed problem-first sequence
- **AND** module-level detail appears only after the problem and outcome framing is established

### Requirement: Hero SHALL use simplified positioning and constrained visual load
The hero SHALL use one primary statement, one supporting statement, one primary CTA for the currently available signup or access path, one secondary “Explore the features” CTA linking to the feature overview, and one reassurance line indicating that PaidSoon works alongside rather than replaces accounting systems. The hero MUST present either a single dashboard illustration or four outcome cards, but not an equal-weight multi-module grid.

#### Scenario: Visitor scans above-the-fold section
- **WHEN** the hero is rendered on desktop or mobile
- **THEN** it identifies PaidSoon as financial control for Australian businesses and uses the H1 “Take control of your cash flow, costs and business finances”
- **AND** its supporting copy describes verified platform capabilities and includes InvoiceGuard as the invoice-follow-up module rather than calling that module PaidSoon
- **AND** its primary CTA says “Start your free trial” only when the configured signup path offers a trial; otherwise it uses the existing early-access/contact action
- **AND** its secondary CTA is “Explore the features” and links to `/features`
- **AND** the visual treatment avoids equal prominence for the full module set

### Requirement: Early differentiator section SHALL contrast accounting records with next-action guidance
Immediately below the hero, the marketing journey SHALL include a concise comparison that distinguishes historical accounting records from PaidSoon next-action guidance across receivables, waste control, commitments, and planning.

#### Scenario: Visitor evaluates product category fit
- **WHEN** the visitor reads the first explanatory section below the hero
- **THEN** they can see a side-by-side contrast of what accounting software provides versus what PaidSoon adds
- **AND** the section frames PaidSoon as complementary rather than a replacement

### Requirement: CTA intensity SHALL escalate by journey stage
Marketing surfaces SHALL apply stage-appropriate CTA intensity: hero to the currently available signup or early-access action, post-problem explanation to see how it works, post-cycle explanation to explore the platform, post-module examples to find a starting point, post-pricing to the available signup or early-access action, and footer to a business conversation.

#### Scenario: Visitor progresses down the homepage
- **WHEN** a visitor scrolls through ordered journey sections
- **THEN** each major stage presents its designated CTA intent
- **AND** CTA labels remain consistent with the stage objective rather than reusing a single undifferentiated action

### Requirement: Navigation and solution taxonomy SHALL be outcome-oriented
Top-level marketing navigation SHALL prioritize “How it works,” “Solutions,” and pricing discovery, with solution groupings centered on the four business outcomes Get Paid, Control Costs, Plan Ahead, and Stop Waste.

#### Scenario: Visitor opens solution navigation
- **WHEN** the visitor opens the Solutions menu
- **THEN** solution entries are grouped by the four outcome labels
- **AND** module-brand detail is subordinate to business-problem framing

#### Scenario: Visitor scans module placement by outcome
- **WHEN** a visitor views homepage, feature overview, navigation, or platform groupings
- **THEN** InvoiceGuard and DepositGuard appear under Get Paid, SpendLeak under Stop Waste, cost and margin modules under Control Costs, and cash-planning modules under Plan Ahead
- **AND** Owner's Digest is described as cross-module visibility rather than mislabelled as an unrelated outcome pillar