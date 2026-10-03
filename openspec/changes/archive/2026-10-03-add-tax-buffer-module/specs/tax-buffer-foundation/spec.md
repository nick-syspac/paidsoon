## Purpose

Define Tax Buffer as a tenant-scoped financial-control capability that models tax reserve obligations and safe-to-spend cash without acting as tax advice, BAS lodgement, or accounting software.

## ADDED Requirements

### Requirement: Tax Buffer SHALL persist tenant-scoped reserve configuration and obligations
The system SHALL store Tax Buffer configuration, reserve categories, obligations, snapshots, and override records with tenant-level isolation and source provenance.

#### Scenario: User reads Tax Buffer data
- **WHEN** an authenticated user opens Tax Buffer for their account
- **THEN** the system returns only rows owned by that user tenant context
- **THEN** each estimate includes source metadata and last-updated context when available

### Requirement: Tax Buffer SHALL separate planning estimates from compliance outcomes
The system SHALL present Tax Buffer outputs as planning estimates and SHALL not represent them as legally definitive tax liabilities.

#### Scenario: User views reserve recommendation
- **WHEN** Tax Buffer renders reserve values and recommendations
- **THEN** the interface includes clear non-advice disclaimer language
- **THEN** wording avoids claiming BAS preparation, lodgement, or official tax determination

### Requirement: Tax Buffer SHALL support auditable manual overrides
The system SHALL retain both calculated values and override values, including reason, actor, and timestamp, and SHALL use the override as the effective planning value until removed or replaced.

#### Scenario: User applies manual GST override
- **WHEN** a user saves an override for a tax category estimate
- **THEN** the effective reserve uses the override value
- **THEN** the system records calculated value, override value, reason, actor, and timestamp in the audit trail
