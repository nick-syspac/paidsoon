## ADDED Requirements

### Requirement: Admin supports issue triage and operational follow-up across all active modules

The system SHALL let admin users access issue-driven workflow entry points from the admin console, including customer support, module health checks, billing events, and escalation paths. Operators SHALL be able to move from issue detection to relevant workflows without leaving the administration context.

#### Scenario: Operator resolves a customer issue from a single entry
- **WHEN** an admin user identifies a customer or module issue from the admin dashboard
- **THEN** the dashboard offers direct access to the relevant customer record, action route, or module detail view
- **AND** the operator can continue the workflow without manual route navigation

### Requirement: New module issue paths are surfaced as first-class admin flows

The system SHALL treat the newest operational modules as part of the admin issue map rather than isolated features. Each supported module SHALL have a clear admin path for checking health, verifying status, and escalating or fixing problems.

#### Scenario: Admin reaches the right workflow for a new module
- **WHEN** the operator needs to investigate a new module issue
- **THEN** the admin console provides the correct direct link or issue entry point
- **AND** the workflow is consistent with the rest of the admin support experience

### Requirement: Admin operation records remain traceable across modules

The system SHALL maintain audit and action context for module-level and customer-level admin operations so support and platform actions remain attributable. Issue resolution steps SHALL be logged consistently regardless of which module or issue path is used.

#### Scenario: Support action is tied to the correct issue context
- **WHEN** an admin user performs a support or issue-resolution action
- **THEN** the system captures the actor, target, module, time, and reason
- **AND** the action is visible in the admin audit trail for later review
