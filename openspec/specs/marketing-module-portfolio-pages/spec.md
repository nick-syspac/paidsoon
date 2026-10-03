## Purpose

Define how the marketing site presents the full public PaidSoon module portfolio through shared content, dedicated module pages, and consistent cross-linking so prospects can understand the platform without relying on partial or conflicting page-local copy.

## Requirements

### Requirement: Marketing module portfolio SHALL be defined in one shared public catalog
The system SHALL define the public marketing module portfolio in one shared source that identifies each module's public route, display name, ordering, status label, positioning summary, and cross-link targets. Marketing navigation, homepage portfolio sections, platform overview surfaces, product index surfaces, and footer product links SHALL read from that shared source rather than maintaining separate hand-written module lists.

#### Scenario: Shared catalog drives product navigation
- **WHEN** the public module portfolio is rendered in the marketing navigation or footer
- **THEN** the same ordered set of public modules is shown on each surface
- **AND** each entry links to the module route defined in the shared catalog

#### Scenario: Shared catalog adds a newly public module
- **WHEN** a module is marked public in the shared marketing module catalog
- **THEN** homepage and other portfolio surfaces can include that module without requiring a second independently maintained module list

### Requirement: Marketing portfolio surfaces SHALL present the full current public module set
The system SHALL present the full current public module set across the homepage, platform overview, and product-discovery surfaces without assigning equal narrative weight to every module in the first-view experience. The homepage SHALL prioritize four outcome groups and defer comprehensive module detail to lower sections and dedicated destinations.

#### Scenario: Platform overview includes current modules
- **WHEN** a visitor views the platform overview or equivalent product-discovery page
- **THEN** the page presents the full current public module set
- **AND** it organizes them under outcome groupings that reduce first-view cognitive load

#### Scenario: Homepage module section includes new FinOps modules
- **WHEN** a visitor views the homepage module or platform section
- **THEN** newer public modules such as CommitGuard, Owner's Digest, Tax Buffer, MarginGuard, and RunwayGuard are discoverable alongside PaidSoon, SpendLeak, CostGuard, and CashPlan
- **AND** the comprehensive module inventory is positioned after the core problem-and-outcome explanation

### Requirement: Each public module SHALL have a dedicated marketing destination and portfolio cross-links
Each module in the public marketing catalog SHALL have a dedicated marketing destination or anchored destination that answers the module problem, what PaidSoon does, what users see, what action they can take, who it is for, and which plan includes it. Portfolio surfaces SHALL link into those destinations, and each destination SHALL link to complementary modules.

#### Scenario: Visitor drills into a module from the portfolio
- **WHEN** a visitor selects a module card or product link from the homepage, nav, footer, platform page, or product index
- **THEN** they land on a dedicated destination for that module with problem-led positioning and CTA context
- **AND** the destination includes a clear next action for early-access onboarding

#### Scenario: Module page links to related modules
- **WHEN** a visitor reads a module page for one public module
- **THEN** the page provides links to complementary modules in the portfolio
- **AND** it ends with a starting-point CTA that reinforces platform-level coherence

### Requirement: Marketing module portfolio SHALL include DepositGuard as a first-class module destination
The shared marketing module portfolio and product discovery surfaces SHALL include DepositGuard with a dedicated destination and links from navigation and portfolio sections.

#### Scenario: Visitor opens product navigation
- **WHEN** a visitor opens marketing product navigation or module portfolio surfaces
- **THEN** DepositGuard appears as a discoverable module entry with the route defined by the shared marketing module catalog

#### Scenario: Visitor selects DepositGuard from portfolio
- **WHEN** a visitor selects the DepositGuard card or navigation link
- **THEN** they land on a DepositGuard destination that explains the module outcomes and links to related modules
