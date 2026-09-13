## Purpose

The dashboard navigation SHALL reflect the real operating sequence of the product so users can discover the most relevant modules in a coherent order instead of in the order they were added to the codebase.

## ADDED Requirements

### Requirement: Dashboard navigation follows product flow
The dashboard sidebar SHALL list sections in a product-oriented order that starts with overview and operational follow-up, then moves into direct action and deeper risk modules.

#### Scenario: Owner opens the dashboard sidebar
- **WHEN** an authenticated user views the dashboard navigation
- **THEN** the sidebar shows Overview, Invoices, Resolved Invoices, and the most relevant operational modules in a predictable, business-prioritised order

#### Scenario: Navigation order reflects the overview narrative
- **WHEN** the user reads the dashboard navigation from top to bottom
- **THEN** it matches the overview's action-first and risk-second structure rather than the historical order of module implementation

### Requirement: Secondary modules are grouped below core operational pages
The module list SHALL keep core operational pages before deeper financial or risk modules, with less frequent or more specialised modules positioned after the primary operating sections.

#### Scenario: User needs a core module quickly
- **WHEN** a user is looking for the most common workflow actions
- **THEN** the core operational pages are visible before advanced guard or analysis modules

#### Scenario: Advanced modules remain discoverable
- **WHEN** a user wants to open a deeper financial or risk module
- **THEN** those modules remain accessible in the sidebar without being treated as the first thing a user must interpret

### Requirement: Module visibility remains permission-aware
The dashboard sidebar SHALL continue to respect existing entitlement checks for each module and shall not expose unavailable or locked modules to users who do not have access.

#### Scenario: User has restricted access
- **WHEN** a user lacks access to a module
- **THEN** the system omits that entry from the sidebar while preserving the correct order of the remaining items

#### Scenario: User gains access later
- **WHEN** the user’s plan or access state changes
- **THEN** the sidebar updates to include the newly permitted module in the correct position without altering the surrounding navigation hierarchy
