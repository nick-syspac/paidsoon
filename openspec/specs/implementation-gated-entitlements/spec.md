# implementation-gated-entitlements Specification

## Purpose
Define a consistent contract for features that are commercially entitled by tier but not yet implemented, so users can understand availability without entering non-functional workflows.
## Requirements
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

### Requirement: Unimplemented feature APIs return deterministic unavailability
APIs backing entitled but unimplemented feature workflows SHALL return a deterministic unavailable response with a machine-readable reason code and SHALL NOT return a success response implying completed work. This requirement applies to Team invite actions while `team_seats` is not implemented.

#### Scenario: Client submits an action for an unimplemented feature
- **WHEN** a client sends a request to execute an unimplemented feature workflow
- **THEN** the API response indicates feature unavailable and includes a stable reason code usable by the client UI

#### Scenario: Team invite API is called while Team seats are unimplemented
- **WHEN** a request is made to execute Team invite actions while `team_seats` is unimplemented
- **THEN** the system returns a feature-unavailable response rather than a success response

#### Scenario: Unimplemented API is called repeatedly
- **WHEN** repeated requests are made to an unimplemented feature endpoint
- **THEN** each response remains consistently unavailable with the same reason code semantics

### Requirement: Team seats remain visible as plan context without operational invites
When Team seats are unimplemented, the system SHALL allow plan-level seat context to be visible while Team invite actions remain unavailable.

#### Scenario: User views Team settings before seat implementation
- **WHEN** Team seats are unimplemented and the user opens Team settings
- **THEN** the page displays seat context and coming-soon messaging, and invite submission controls are disabled or omitted

### Requirement: Owner's Digest SHALL degrade gracefully when contributing modules are unavailable
When Owner's Digest is available to a tenant but some contributing modules are not entitled, not configured, or not yet implemented for that tenant, the digest SHALL omit those modules from the digest signal set and SHALL NOT present them as broken cards or completed capabilities.

#### Scenario: Tenant lacks a contributing module entitlement
- **WHEN** Owner's Digest is generated for a tenant without access to one or more source modules
- **THEN** the digest excludes those modules from scoring and summary generation
- **AND** the user sees a coherent digest built from the entitled modules only

#### Scenario: Contributing module is entitled but not yet operational
- **WHEN** a tenant is commercially entitled to a contributing module that is still marked unimplemented or operationally inactive
- **THEN** Owner's Digest does not treat that module as an active signal provider
- **AND** the user-facing experience does not imply that findings from that module are live

### Requirement: Owner's Digest email and scheduling controls SHALL remain non-actionable until operational
If Owner's Digest dashboard access is entitled but scheduled delivery is not yet operational in the active environment, the system SHALL present digest email controls and automated-delivery actions using the existing coming-soon or unavailable pattern instead of implying that email delivery is active.

#### Scenario: User opens digest settings before delivery path is operational
- **WHEN** the tenant can view Owner's Digest settings but automated delivery has not been activated in the current environment
- **THEN** delivery-related controls remain non-actionable and clearly marked as unavailable

#### Scenario: API request targets an inactive delivery action
- **WHEN** a client requests an Owner's Digest delivery action that is not yet operational
- **THEN** the API returns the deterministic unavailable response pattern rather than a false success response

### Requirement: DepositGuard preview mode SHALL be available to non-operational tiers
When tenants lack DepositGuard operational entitlements, the system SHALL still show DepositGuard navigation and overview context while keeping create/send/payment actions non-actionable.

#### Scenario: Essentials tenant opens DepositGuard
- **WHEN** a tenant without operational DepositGuard entitlement loads the DepositGuard dashboard route
- **THEN** the route returns a preview-safe experience with upgrade guidance
- **AND** operational APIs remain blocked server-side

#### Scenario: Non-entitled user calls operational API directly
- **WHEN** a non-entitled user sends a direct create/send/record-payment request
- **THEN** the API returns a deterministic upgrade-required response and does not create financial records

