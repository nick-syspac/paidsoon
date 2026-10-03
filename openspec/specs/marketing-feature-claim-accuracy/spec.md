## Purpose

Define guardrails for public marketing copy so portfolio claims stay aligned with shipped module availability and clearly label planned capabilities.

## Requirements

### Requirement: Marketing module portfolio claims MUST distinguish public modules from planned capabilities
Marketing portfolio surfaces SHALL describe module availability using explicit status language aligned to private beta: “Available in private beta,” “Included in selected early-access plans,” or “Coming soon.” Pages MUST avoid using generic “available now” language that can be interpreted as open public signup.

#### Scenario: Public module cards avoid planned-only claims
- **WHEN** a marketing page highlights CommitGuard, Owner's Digest, Tax Buffer, MarginGuard, or RunwayGuard
- **THEN** it describes only the customer-facing functionality that is currently implemented and publicly presented for that module
- **AND** availability labels match the approved private-beta status vocabulary

#### Scenario: Planned capability remains labelled as planned
- **WHEN** a public module page mentions a related capability that is scaffolded, hidden, or not yet customer-ready
- **THEN** the page labels that capability as planned, coming soon, or contact-only rather than describing it as currently available
- **AND** the page does not imply public self-serve access for that capability

### Requirement: Marketing module discovery surfaces MUST NOT omit implemented public modules from the portfolio narrative
Marketing navigation, homepage portfolio sections, platform overview sections, and product-discovery pages SHALL not present a reduced module list that implies the marketed platform consists only of an outdated subset once additional public modules have shipped. These surfaces SHALL first present outcome-group summaries before exposing exhaustive module-level structure.

#### Scenario: Navigation no longer implies a four-module product
- **WHEN** a visitor opens the Product navigation, homepage portfolio section, or platform overview
- **THEN** the module list reflects the current public platform portfolio instead of implying that only PaidSoon, SpendLeak, CostGuard, and CashPlan exist
- **AND** the first explanatory framing is outcome-led rather than architecture-led

### Requirement: DepositGuard marketing claims MUST separate shipped MVP behavior from planned expansions
Marketing pages that reference DepositGuard SHALL describe only currently implemented customer-facing capabilities as available and SHALL label future integrations or advanced workflows as planned.

#### Scenario: MVP capability is promoted
- **WHEN** marketing copy references DepositGuard deposit requests, reminders, or commencement protection
- **THEN** those claims match implemented MVP behavior and available routes

#### Scenario: Planned integration is referenced
- **WHEN** marketing copy references Stripe Connect customer payments, advanced reconciliation, or broader quote automation that is not yet operational
- **THEN** the copy labels those items as planned, coming soon, or setup-required and not currently live
