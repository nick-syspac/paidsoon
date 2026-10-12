# Spec Delta

## MODIFIED Requirements

### Requirement: Marketing module portfolio SHALL be defined in one shared public catalog
The system SHALL define the public marketing module portfolio in one shared source that identifies each module's canonical public route, display name, ordering, status label, positioning summary, legacy marketing routes, and cross-link targets. Marketing navigation, homepage portfolio sections, platform overview surfaces, product index surfaces, and footer product links SHALL read from that shared source rather than maintaining separate hand-written module lists.

#### Scenario: Shared catalog drives product navigation
- **WHEN** the public module portfolio is rendered in marketing navigation or the footer
- **THEN** the same ordered set of public modules is shown on each surface
- **AND** each entry links to the canonical route defined in the shared catalog

#### Scenario: Shared catalog adds a newly public module
- **WHEN** a module is marked public in the shared marketing module catalog
- **THEN** homepage and other portfolio surfaces can include that module without requiring a second independently maintained module list

#### Scenario: Catalog supplies descriptive canonical routes
- **WHEN** the public module catalog is rendered or its routes are used for metadata and sitemap generation
- **THEN** InvoiceGuard uses `/features/invoiceguard`, SpendLeak uses `/features/unnecessary-spending`, CostGuard uses `/features/spending-controls`, CashPlan uses `/features/cash-flow-planner`, and DepositGuard uses `/features/deposits-upfront-payments`
- **AND** Tax Buffer uses `/features/tax-set-aside`, CommitGuard uses `/features/upcoming-bills-commitments`, MarginGuard uses `/features/profit-monitor`, RunwayGuard uses `/features/cash-runway`, and Owner's Digest uses `/features/business-snapshot`
- **AND** Client Manager uses `/features/client-manager`

### Requirement: Marketing portfolio surfaces SHALL present the full current public module set
The system SHALL present the full current public module set across the homepage, platform overview, and product-discovery surfaces without assigning equal narrative weight to every module in the first-view experience. The homepage SHALL prioritize the four business outcomes Get Paid, Control Costs, Plan Ahead, and Stop Waste, and defer comprehensive module detail to lower sections and dedicated destinations.

#### Scenario: Platform overview includes current modules
- **WHEN** a visitor views the platform overview or equivalent product-discovery page
- **THEN** the page presents the full current public module set
- **AND** it organizes them under outcome groupings that reduce first-view cognitive load

#### Scenario: Homepage module section includes new FinOps modules
- **WHEN** a visitor views the homepage module or platform section
- **THEN** current public modules are discoverable under Get Paid, Control Costs, Plan Ahead, or Stop Waste, with Owner's Digest positioned as cross-module visibility
- **AND** the comprehensive module inventory is positioned after the core problem-and-outcome explanation

### Requirement: Each public module SHALL have a dedicated marketing destination and portfolio cross-links
Each module in the public marketing catalog SHALL have a dedicated marketing destination at its canonical route that answers the module problem, what PaidSoon does, what users see, what action they can take, who it is for, and which plan includes it. Portfolio surfaces SHALL link to canonical destinations, and each destination SHALL link to complementary modules.

#### Scenario: Visitor drills into a module from the portfolio
- **WHEN** a visitor selects a module card or product link from the homepage, navigation, footer, platform page, or product index
- **THEN** they land on that module's descriptive canonical destination with problem-led positioning and CTA context
- **AND** the destination includes a clear next action for early-access onboarding or the currently available signup path

#### Scenario: Existing module route redirects to its canonical destination
- **WHEN** a visitor requests an existing module route `/invoiceguard`, `/spendleak`, `/costguard`, `/cashplan`, `/deposit-guard`, `/tax-buffer`, `/commitguard`, `/margin-guard`, `/runway-guard`, or `/owners-digest`
- **THEN** the server returns a permanent redirect directly to that module's canonical `/features/` destination
- **AND** a request to `/paidsoon` redirects directly to `/features/invoiceguard`, without passing through `/invoiceguard`
- **AND** query parameters are retained where the framework redirect supports them

#### Scenario: Redirect does not alter platform or authenticated routes
- **WHEN** a visitor requests the PaidSoon homepage, a platform overview route, or an authenticated application route
- **THEN** the request is not redirected to an InvoiceGuard or feature-module destination

#### Scenario: Module page links to related modules
- **WHEN** a visitor reads a module page for one public module
- **THEN** the page provides links to complementary modules using their canonical destinations
- **AND** it ends with a starting-point CTA that reinforces platform-level coherence

#### Scenario: Canonical feature pages are the only indexable module destinations
- **WHEN** search metadata or the XML sitemap is generated for public modules
- **THEN** canonical tags and social URLs use the absolute production URL for each `/features/` destination
- **AND** the sitemap includes canonical feature destinations and excludes redirected legacy module paths

### Requirement: Marketing module portfolio SHALL include DepositGuard as a first-class module destination
The shared marketing module portfolio and product discovery surfaces SHALL include DepositGuard with a dedicated destination and links from navigation and portfolio sections.

#### Scenario: Visitor opens product navigation
- **WHEN** a visitor opens marketing product navigation or module portfolio surfaces
- **THEN** DepositGuard appears as a discoverable module entry with the route defined by the shared marketing module catalog

#### Scenario: Visitor selects DepositGuard from portfolio
- **WHEN** a visitor selects the DepositGuard card or navigation link
- **THEN** they land on a DepositGuard destination that explains the module outcomes and links to related modules