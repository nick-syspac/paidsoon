## Purpose

Define tenant-safe background processing for MarginGuard snapshots, alert evaluation, and rule application so dashboard performance remains predictable and trend history is reliable.

## ADDED Requirements

### Requirement: MarginGuard SHALL persist periodic profitability snapshots
The system SHALL persist tenant-scoped margin snapshots for selected periods to support trend history and deterioration detection without full-history scans per request.

#### Scenario: Daily snapshot generation
- **WHEN** scheduled processing runs for an active tenant
- **THEN** a snapshot is written or upserted for the configured period with calculated values and completeness metadata

### Requirement: MarginGuard background jobs SHALL be idempotent and retry-safe
The system SHALL ensure repeated processing does not duplicate snapshots, alerts, or events for the same tenant-period key.

#### Scenario: Job retried after transient failure
- **WHEN** a snapshot job reruns for a tenant-period previously processed
- **THEN** existing records are updated deterministically without duplicate alert/event side effects
