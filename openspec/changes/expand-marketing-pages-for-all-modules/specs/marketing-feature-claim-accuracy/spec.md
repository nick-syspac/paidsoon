## ADDED Requirements

### Requirement: Marketing module portfolio claims MUST distinguish public modules from planned capabilities
Marketing portfolio surfaces SHALL describe a module as publicly available only when that module has a reachable public marketing destination and customer-facing product surface. If a page references related capabilities that are not yet implemented or are not yet public, it SHALL label them as planned or coming soon instead of presenting them as live module functionality.

#### Scenario: Public module cards avoid planned-only claims
- **WHEN** a marketing page highlights CommitGuard, Owner's Digest, Tax Buffer, MarginGuard, or RunwayGuard
- **THEN** it describes only the customer-facing functionality that is currently implemented and publicly presented for that module
- **AND** it does not bundle unimplemented adjacent capabilities into the live claim set

#### Scenario: Planned capability remains labelled as planned
- **WHEN** a public module page mentions a related capability that is scaffolded, hidden, or not yet customer-ready
- **THEN** the page labels that capability as planned, coming soon, or contact-only rather than describing it as currently available

### Requirement: Marketing module discovery surfaces MUST NOT omit implemented public modules from the portfolio narrative
Marketing navigation, homepage portfolio sections, platform overview sections, and product-discovery pages SHALL not present a reduced module list that implies the marketed platform consists only of an outdated subset once additional public modules have shipped.

#### Scenario: Navigation no longer implies a four-module product
- **WHEN** a visitor opens the Product navigation, homepage portfolio section, or platform overview
- **THEN** the module list reflects the current public platform portfolio instead of implying that only PaidSoon, SpendLeak, CostGuard, and CashPlan exist
