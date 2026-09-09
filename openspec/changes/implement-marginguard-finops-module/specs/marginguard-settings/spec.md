## Purpose

Provide module-scoped MarginGuard settings for targets, thresholds, defaults, and notifications while reusing the existing PaidSoon settings architecture and entitlement checks.

## ADDED Requirements

### Requirement: MarginGuard SHALL support hierarchical margin targets
The system SHALL allow tenant-wide target, warning, and critical thresholds and SHALL support optional overrides for customer, product/service, category, and project/job using inheritance precedence from most specific to tenant default.

#### Scenario: Target inheritance fallback
- **WHEN** no customer-specific target exists
- **THEN** MarginGuard applies category target if available, otherwise applies tenant default target

### Requirement: MarginGuard SHALL validate threshold relationships
The system SHALL reject invalid target configurations where `critical` is not less than `warning` or `warning` is not less than `target`.

#### Scenario: Invalid threshold update rejected
- **WHEN** a user submits thresholds where warning is greater than or equal to target
- **THEN** the settings API rejects the update with a validation error and preserves existing values

### Requirement: MarginGuard SHALL persist module operational defaults
The system SHALL store enablement state, default reporting period, and alert category preferences under existing settings conventions.

#### Scenario: Module disabled in settings
- **WHEN** a tenant disables MarginGuard
- **THEN** module routes return disabled-state payloads and UI shows setup/enable guidance instead of analysis views
