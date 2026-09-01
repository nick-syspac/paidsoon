## Purpose

Define user-facing lifecycle controls for SpendLeak findings so users can manage noise while preserving an auditable state progression.

## ADDED Requirements

### Requirement: Lifecycle action availability
The system SHALL present only lifecycle actions that are permitted for the finding's current state.

#### Scenario: Open finding
- **WHEN** a finding state is open
- **THEN** the UI shows actions allowed from open (for example dismiss, resolve, or snooze if supported)

#### Scenario: Already resolved finding
- **WHEN** a finding state is resolved
- **THEN** the UI does not present actions that are invalid for resolved state

### Requirement: Lifecycle action feedback
Lifecycle actions SHALL provide immediate user feedback for success and failure states.

#### Scenario: Action succeeds
- **WHEN** a lifecycle action request succeeds
- **THEN** the UI updates the finding state and shows confirmation without requiring full-page reload

#### Scenario: Action fails
- **WHEN** a lifecycle action request fails validation or authorization
- **THEN** the UI preserves prior state and displays a clear error message

### Requirement: Tenant-safe lifecycle updates
Lifecycle UI updates SHALL reflect only the requesting tenant's finding state and SHALL never imply updates to other tenants.

#### Scenario: Cross-tenant identifier misuse
- **WHEN** a lifecycle action is attempted with an identifier not belonging to the signed-in tenant
- **THEN** the UI shows a not-found or unauthorized result and no local state mutation occurs
