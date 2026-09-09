## Purpose

Define settings and policy controls for RunwayGuard so tenants can configure runway horizons, risk thresholds, weighting behavior, and notification preferences.

## ADDED Requirements

### Requirement: RunwayGuard settings are tenant-scoped and entitlement-aware
The system MUST store RunwayGuard settings per tenant and enforce plan entitlements for advanced settings controls.

#### Scenario: Non-entitled tenant edits advanced threshold settings
- **WHEN** a tenant without advanced entitlement submits a threshold customization request
- **THEN** the server rejects the change and preserves existing policy settings

### Requirement: Forecast horizon and threshold policies are configurable
The system SHALL allow configuration of forecast horizon and runway threshold values through centralized policy settings.

#### Scenario: Threshold update
- **WHEN** an authorized tenant updates warning and critical thresholds with valid ordering
- **THEN** new runway status calculations use the updated thresholds

### Requirement: Confidence weighting policy is configurable
The system SHALL allow policy controls for including low-confidence receivables and applying default low-confidence weighting factors.

#### Scenario: Low-confidence receivable weighting disabled
- **WHEN** include-low-confidence-receivables is disabled
- **THEN** low-confidence receivables are excluded from effective inflow assumptions

### Requirement: Runway notifications respect channel preferences
The system SHALL allow notification preference controls for in-app, email, and digest channels where notification infrastructure supports those channels.

#### Scenario: In-app only preference
- **WHEN** runway alerts are generated for a tenant configured as in-app only
- **THEN** alerts are delivered in-app and not sent through disabled channels
