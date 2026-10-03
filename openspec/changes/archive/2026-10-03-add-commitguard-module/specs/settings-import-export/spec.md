## ADDED Requirements

### Requirement: Settings import/export SHALL include CommitGuard module settings
The settings import/export system SHALL include CommitGuard configuration values in module-scoped payloads using the same validation and compatibility behavior as existing settings modules.

#### Scenario: User exports module settings
- **WHEN** a user exports settings
- **THEN** CommitGuard settings fields are included with stable keys and schema-consistent value formats

#### Scenario: User imports settings missing CommitGuard keys
- **WHEN** an import payload omits CommitGuard fields
- **THEN** existing CommitGuard settings remain unchanged and import processing follows existing partial-import semantics
