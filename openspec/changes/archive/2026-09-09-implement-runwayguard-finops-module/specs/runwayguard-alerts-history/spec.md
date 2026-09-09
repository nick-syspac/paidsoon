## Purpose

Define durable runway alerting and historical snapshot behavior so owners are warned on meaningful deterioration and can track runway movement over time.

## ADDED Requirements

### Requirement: Runway threshold alerts fire on transitions
The system MUST generate alerts when runway crosses configured thresholds into higher-risk bands and when runway recovers above previously breached thresholds.

#### Scenario: Runway falls below warning threshold
- **WHEN** runway transitions from watch to warning
- **THEN** exactly one threshold-breach alert is created for that transition

#### Scenario: Runway recovery
- **WHEN** runway transitions from warning back to watch or healthy
- **THEN** a recovery alert is created once for the transition

### Requirement: Alert generation avoids duplicate spam
The system MUST persist prior alert state and MUST suppress duplicate alerts for unchanged threshold conditions.

#### Scenario: Recalculation with unchanged risk band
- **WHEN** runway is recalculated repeatedly within the same status band
- **THEN** duplicate threshold alerts are not emitted

### Requirement: Material-change alerts are supported
The system SHALL support policy-based alerts for significant runway deterioration events such as percentage decline or commitment-driven day loss.

#### Scenario: New commitment materially reduces runway
- **WHEN** runway loss from a new commitment exceeds configured materiality
- **THEN** a commitment-impact runway risk alert is created

### Requirement: Periodic runway snapshots are persisted
The system MUST persist periodic runway snapshots with sufficient fields for trend analysis, threshold transitions, and historical comparison.

#### Scenario: Scheduled snapshot capture
- **WHEN** snapshot generation runs on schedule
- **THEN** a tenant-scoped runway snapshot record is stored with calculated runway metrics and calculation metadata
