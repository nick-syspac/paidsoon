## MODIFIED Requirements

### Requirement: Entitled but unimplemented features are non-actionable
The system SHALL treat any feature that is entitled by plan but marked unimplemented as non-actionable. The system SHALL present that feature as planned or coming soon and SHALL NOT expose a workflow that appears to complete the feature.

#### Scenario: User opens a settings area for an entitled but unimplemented feature
- **WHEN** a signed-in user navigates to a settings page for a feature that their plan includes but the catalog marks as unimplemented
- **THEN** the page shows read-only coming-soon status and does not allow submission of the feature action

#### Scenario: User reaches a feature UI through a deep link
- **WHEN** a user loads a direct URL for an entitled but unimplemented feature surface
- **THEN** the UI still renders as non-actionable and does not expose an operational action path

#### Scenario: Entitled feature is operationally inactive in production
- **WHEN** a feature is commercially entitled but lacks an active production execution path
- **THEN** the feature is marked and presented as unimplemented/coming soon until operational activation is verified
