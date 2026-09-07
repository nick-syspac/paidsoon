## Purpose

Define evidence-first drill-down behavior so users can inspect why a SpendLeak finding exists before taking action.

## ADDED Requirements

### Requirement: Insight detail drill-down access
The system SHALL provide a drill-down view for each SpendLeak finding shown in dashboard modules.

#### Scenario: User opens a finding detail
- **WHEN** a user selects a SpendLeak finding from a module
- **THEN** the system opens a detail view tied to that finding identifier

### Requirement: Evidence transparency
Each finding detail view SHALL display the supporting evidence payload required to explain the finding, including source references and timestamps when present.

#### Scenario: Evidence is available
- **WHEN** a finding includes source-linked evidence data
- **THEN** the detail view shows the evidence fields without exposing unrelated tenant records

#### Scenario: Limited evidence payload
- **WHEN** a finding has partial evidence data
- **THEN** the detail view renders the available evidence and indicates missing fields explicitly

### Requirement: Drill-down failure handling
The detail experience SHALL handle unavailable, deleted, or unauthorized finding reads with safe fallback behavior.

#### Scenario: Finding no longer available
- **WHEN** the selected finding cannot be loaded
- **THEN** the system shows a non-destructive error state and preserves the dashboard context
