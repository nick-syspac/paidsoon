## Purpose

Define the user-facing CashPlan dashboard and settings experience so owners can understand cash-health status, act on forecast recommendations, and configure the planning inputs without leaving the authenticated PaidSoon experience.

## ADDED Requirements

### Requirement: CashPlan dashboard shows operational status at a glance
The system SHALL show a CashPlan summary in the authenticated dashboard that makes the forecast health, low-point risk, confidence state, and recommended actions visible without requiring an explicit deep-dive workflow.

#### Scenario: User opens the dashboard with active CashPlan data
- **WHEN** an authenticated user opens the dashboard and has a CashPlan plan available
- **THEN** the system displays the current cash-health status, lowest-balance risk, confidence band, and next action guidance in a consistent, scannable summary area

#### Scenario: User views stale or incomplete data
- **WHEN** CashPlan data is stale, missing, or low-confidence
- **THEN** the system surfaces the issue with clear status messaging and a path to the relevant settings or data-quality workflow

### Requirement: CashPlan settings expose the plan controls users need
The system SHALL provide a dedicated CashPlan settings area where the tenant can review base configuration, data freshness, and operational settings that affect the forecast without exposing unsupported or internal-only controls.

#### Scenario: User opens CashPlan settings
- **WHEN** an authenticated user opens the CashPlan settings area
- **THEN** the system shows the plan status, active settings summary, and actionable controls relevant to review and maintenance

#### Scenario: User changes a plan setting
- **WHEN** a user updates a supported CashPlan setting
- **THEN** the system validates the input, stores the change within the tenant-scoped settings model, and reflects the update in the current dashboard summary

### Requirement: Dashboard and settings remain linked to the same CashPlan state
The system SHALL keep the dashboard summary and the settings panel aligned so a user can move between seeing the operational risk and adjusting the planning configuration without confusion.

#### Scenario: User navigates from dashboard to settings
- **WHEN** a user follows a status or action link from the dashboard to the CashPlan settings area
- **THEN** the system opens the relevant section with the current tenant state, not a blank or stale configuration screen

#### Scenario: Settings changes affect dashboard messaging
- **WHEN** a supported setting changes in a way that alters the forecast posture or quality signals
- **THEN** the system refreshes the dashboard summary to reflect the new state and re-renders the appropriate action guidance
