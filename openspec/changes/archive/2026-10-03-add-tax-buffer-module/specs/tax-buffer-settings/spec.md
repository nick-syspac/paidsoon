## Purpose

Define Tax Buffer setup and settings management so tenants can configure accounting basis, reserve methods, frequencies, reserve accounts, and override controls without requiring accounting-system expertise.

## ADDED Requirements

### Requirement: Tax Buffer SHALL provide configurable settings for core tax categories
The system SHALL allow tenants to enable or disable GST, PAYG withholding, PAYG instalments, income/company tax, and custom reserve categories with category-specific methods and frequencies.

#### Scenario: User configures PAYG instalment method
- **WHEN** a user sets PAYG instalment to fixed amount or percentage mode
- **THEN** the configuration is persisted and used by the next Tax Buffer calculation
- **THEN** invalid combinations are rejected with field-level validation errors

### Requirement: Tax Buffer SHALL support reserve-account sourcing
The system SHALL allow tenants to nominate a reserve account balance source when available, or manually provide current reserved amount when account data is unavailable.

#### Scenario: No linked reserve account
- **WHEN** account-level reserve balance data is unavailable
- **THEN** the settings flow allows manual reserve amount entry
- **THEN** the source is marked as manual in summary and explainability outputs

### Requirement: Tax Buffer SHALL include first-time setup guidance
The system SHALL provide an onboarding sequence that captures GST registration status, accounting basis, BAS frequency, and enabled reserve categories with editable defaults.

#### Scenario: First-time Tax Buffer setup
- **WHEN** a tenant enables Tax Buffer for the first time
- **THEN** the system presents setup questions in a guided sequence
- **THEN** provider/import-derived defaults are suggested when reliable data exists
