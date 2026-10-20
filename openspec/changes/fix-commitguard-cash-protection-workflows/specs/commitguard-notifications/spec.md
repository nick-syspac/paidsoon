# Spec Delta

## MODIFIED Requirements

### Requirement: CommitGuard SHALL publish notification events through the shared framework
The system SHALL expose due-soon, amount-change, renewal, notice-period, detection, buffer-low, and shortfall events in tenant-scoped history and reuse the existing enabled, entitled Owner's Digest channel for relevant scheduled delivery. A separate shared notification framework or immediate-email channel SHALL NOT be assumed or advertised.

#### Scenario: Commitment due soon
- **WHEN** an active commitment enters the configured due-soon window
- **THEN** a COMMITMENT_DUE_SOON event is created, visible in CommitGuard, and eligible for the existing enabled notification channel

#### Scenario: Projected shortfall detected
- **WHEN** complete free-cash calculation returns SHORTFALL for the configured horizon
- **THEN** a COMMITMENT_SHORTFALL event is emitted with currency, horizon, and projected deficit context

#### Scenario: Existing digest channel is disabled
- **WHEN** the tenant has not enabled or is not entitled to Owner's Digest delivery
- **THEN** events remain visible in CommitGuard but no additional email subscription or delivery is created

#### Scenario: Missing cash or paused obligation
- **WHEN** cash context is unavailable or an obligation is paused, cancelled, or expired
- **THEN** unavailable cash does not generate a cash-risk alert and inactive obligations do not generate due-soon or renewal alerts

### Requirement: CommitGuard notifications SHALL be deduplicated per commitment event window
The system SHALL avoid duplicate events for the same occurrence, renewal-cycle threshold, detection evidence, or unchanged risk episode. Retries SHALL retain stable identities, and events included in Owner's Digest SHALL use that channel's existing delivery identity without duplicate signals within one digest.

#### Scenario: Repeated scheduler runs
- **WHEN** scheduled evaluation runs multiple times before the commitment due window changes
- **THEN** users do not receive duplicate due-soon notifications for the same commitment window

#### Scenario: Renewal countdown advances
- **WHEN** days-to-notice-close decreases within the same configured warning band
- **THEN** the system updates relevance without creating a new event for each remaining-day value

#### Scenario: Risk resolves and recurs
- **WHEN** complete cash context returns to SAFE and subsequently enters SHORTFALL again
- **THEN** the previous episode remains historical and one new shortfall episode is created

## ADDED Requirements

### Requirement: Alert evaluation SHALL not depend on page visits
Enabled entitled tenants SHALL receive recoverable alert evaluation at least daily and after material commitment, settings, or cash-input changes. Read-only summary retrieval SHALL NOT create durable alerts, and job execution SHALL recheck current tenant access and preferences.

#### Scenario: Owner does not visit the dashboard
- **WHEN** an active obligation enters its due-soon window and no dashboard request occurs
- **THEN** scheduled evaluation records the event within the next daily evaluation cycle

#### Scenario: Enqueue fails after a change
- **WHEN** the transaction commits but task enqueue fails
- **THEN** persisted pending work or the repair sweep eventually evaluates the committed revision without losing or duplicating its events

#### Scenario: Competing or superseded workers
- **WHEN** a worker loses its lease or a newer calculation revision commits before its side effects
- **THEN** the stale worker cannot persist candidate, event, or evaluation-state changes and current work remains recoverable

#### Scenario: Retry budget is exhausted
- **WHEN** the same work generation fails six execution attempts
- **THEN** it is visibly failed with a safe reason, automatic recreation of that identical generation stops, and an authorized retry retains prior attempt history

## RENAMED Requirements

- FROM: `CommitGuard SHALL publish notification events through the shared framework`
- TO: `CommitGuard SHALL publish notification events through existing product channels`