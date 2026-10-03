# implementation-gated-entitlements delta for add-owners-digest-module

## ADDED Requirements

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
