## Purpose

Define a consistent product contract where custom Reply-to is unavailable on Starter, visible as locked in Email Settings, and only actionable on Solo and above.

## ADDED Requirements

### Requirement: Starter Reply-to is visible but non-editable
The system SHALL render the Reply-to control in Email Settings for Starter users as read-only/disabled with explicit upgrade messaging. Starter users SHALL NOT be able to submit a custom Reply-to value from the settings UI.

#### Scenario: Starter user opens Email Settings
- **WHEN** a Starter-tier user opens Email Settings
- **THEN** the Reply-to field is shown in a disabled/greyed state and includes messaging that Reply-to requires Solo or Small Business

#### Scenario: Solo user opens Email Settings
- **WHEN** a Solo-tier user opens Email Settings
- **THEN** the Reply-to field is enabled and editable

### Requirement: Starter Reply-to updates are rejected server-side
The system SHALL reject Starter-tier attempts to persist a custom Reply-to value via the Email Settings API.

#### Scenario: Starter user submits Email Settings with replyTo
- **WHEN** a Starter-tier user sends a PUT request to Email Settings that includes `replyTo`
- **THEN** the API responds with forbidden access and does not persist the custom Reply-to value

#### Scenario: Solo user submits Email Settings with replyTo
- **WHEN** a Solo-tier user sends a PUT request to Email Settings that includes `replyTo`
- **THEN** the API accepts the request and persists the Reply-to value

### Requirement: Reply-to usage in outbound reminders follows entitlement
The system SHALL include a custom Reply-to on outbound reminder emails only when the sender tier has Reply-to entitlement.

#### Scenario: Starter reminder email is prepared
- **WHEN** a reminder email is generated for a Starter-tier account
- **THEN** the outbound message uses no custom Reply-to override

#### Scenario: Solo reminder email is prepared
- **WHEN** a reminder email is generated for a Solo-tier account with a saved Reply-to value
- **THEN** the outbound message includes that Reply-to value
