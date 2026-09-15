## ADDED Requirements

### Requirement: Admin includes the full module set in a single navigable surface

The system SHALL present the admin entry surface as the canonical place for the current module portfolio, including support, billing, issue review, customer management, and module-specific operational views. The admin dashboard SHALL expose each supported module in an organized layout with consistent labels, access checks, and entry points.

#### Scenario: Operator reaches a module from the admin surface
- **WHEN** an admin user opens the admin dashboard
- **THEN** the dashboard shows each supported module in a navigable list or summary layout
- **AND** module entries remain grouped by responsibility and visibility rules
- **AND** the operator can open the module directly from that admin entry without needing unrelated screens or manual URL guesses

### Requirement: Admin module access follows current entitlement and role rules

The system SHALL gate each admin module entry using the same authorization rules as the feature itself. Modules not available to the current user SHALL be hidden or shown in a disabled state, with no bypass of existing access logic.

#### Scenario: Hidden or unsupported module is not shown
- **WHEN** a user does not have access to a module
- **THEN** the admin surface omits or disables that module entry
- **AND** the module is not exposed as an active action or quick link

### Requirement: Admin dashboard summarizes the current status of each supported module

The system SHALL surface the current operational state of each supported module in the admin dashboard rather than only a raw list of links. Each module summary SHALL include brief status, current availability, and the next recommended action when there is a clear issue.

#### Scenario: Admin sees whether a module is healthy or requires action
- **WHEN** the admin dashboard loads
- **THEN** each supported module shows a current status summary
- **AND** the summary distinguishes healthy state, warning state, and blocked state
- **AND** actionable modules include an obvious route to the relevant deeper view
