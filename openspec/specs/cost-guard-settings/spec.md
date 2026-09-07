# cost-guard-settings Specification

## Purpose

Let users configure the operating thresholds and digest cadence for their Cost Guard experience without leaving the authenticated settings area. These settings control how aggressively alerts are raised and how often the summary digest is delivered, while retaining the current safe defaults for customers who do not change them.

## Requirements

### Requirement: Cost Guard settings SHALL be user-scoped
The system SHALL store Cost Guard settings per authenticated user and SHALL never allow a user to change another user’s thresholds or digest preferences.

#### Scenario: User updates their settings
- **WHEN** an authenticated user saves a Cost Guard settings update
- **THEN** the system writes the values only to that user’s `CostGuardSetting` row
- **AND** the change remains protected by the tenant-scoped database context and RLS

### Requirement: Cost Guard settings SHALL support threshold customization
The system SHALL allow a user to adjust the alert sensitivity percentage, minimum materiality amount, and default lookback period within safe business bounds.

#### Scenario: User changes alert sensitivity
- **WHEN** a user sets a new materiality percentage
- **THEN** the system validates that the value is in a supported range
- **AND** the stored value is persisted as the active threshold for future Cost Guard checks

#### Scenario: User changes minimum materiality
- **WHEN** a user updates the minimum impact amount in cents
- **THEN** the system validates the value and stores it as the absolute threshold used to reduce noisy alerts

#### Scenario: User changes the baseline lookback
- **WHEN** a user updates the lookback window in days
- **THEN** the system stores the new period used for measuring supplier or category performance against the normal baseline

### Requirement: Cost Guard settings SHALL support digest cadence configuration
The system SHALL allow users to configure the summary digest cadence for Cost Guard alerts using a supported scheduling mode.

#### Scenario: User chooses a digest frequency
- **WHEN** a user selects the digest mode
- **THEN** the system validates the mode against the supported values
- **AND** the persisted value is used for subsequent cost-risk summary delivery

### Requirement: Cost Guard settings SHALL preserve safe defaults
The system SHALL keep the existing default values when no user-specific override is stored, while allowing explicit user updates to replace those defaults.

#### Scenario: New account has no saved settings row
- **WHEN** a user opens the settings page for the first time
- **THEN** the system shows the default values for materiality, lookback, and digest mode
- **AND** the user can save an override without needing a manual database migration

### Requirement: Cost Guard settings SHALL validate all input
The system SHALL reject invalid or out-of-range values before persisting them, returning a clear validation error rather than storing partial or unsafe data.

#### Scenario: User submits invalid values
- **WHEN** a user posts a percentage, amount, or digest mode outside the supported range
- **THEN** the system rejects the request with a validation error
- **AND** no changes are written to the user’s settings row

## Acceptance Criteria

- Users can view and update their Cost Guard threshold values from the Settings page
- Values are validated before being persisted
- The system stores per-user overrides without bypassing RLS
- The default values remain available when no override exists
- The digest mode is persisted and used consistently by the summary experience
