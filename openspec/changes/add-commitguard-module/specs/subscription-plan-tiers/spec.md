## ADDED Requirements

### Requirement: Plan catalog SHALL define CommitGuard capability matrix
The plan catalog SHALL map CommitGuard capabilities and limits per tier through the canonical subscription feature model used across modules.

#### Scenario: Starter tier user
- **WHEN** a starter-tier user accesses CommitGuard
- **THEN** the system exposes starter-allowed capabilities and enforces starter-specific limits through the centralized plan model

#### Scenario: Higher-tier user
- **WHEN** a higher-tier user accesses CommitGuard forecast and integration features
- **THEN** the system grants only the capabilities enabled by the canonical tier definition in the shared plan catalog
