## ADDED Requirements

### Requirement: Accounting integration layer SHALL provide tax-relevant normalized inputs
The accounting integration layer SHALL expose tax-relevant fields and metadata that are available from provider data while preserving provider-agnostic interfaces.

#### Scenario: Provider supports tax or GST metadata
- **WHEN** provider records include tax treatment, tax code, or GST amount metadata
- **THEN** normalized outputs include the available tax metadata fields for downstream estimation
- **THEN** provider-specific parsing remains isolated inside provider adapters

### Requirement: Accounting integration layer SHALL degrade safely when tax metadata is unavailable
The system SHALL preserve calculation continuity when provider-level tax metadata is missing by marking confidence and using configured fallback methods.

#### Scenario: Missing provider tax-code details
- **WHEN** a provider source omits tax code fields for a subset of records
- **THEN** Tax Buffer receives fallback-safe normalized records with source caveats
- **THEN** downstream outputs mark confidence as reduced instead of presenting definitive liabilities
