## Purpose

Define progress-payment milestone behavior for entitled tenants so jobs can split expected collections across deterministic payment stages without corrupting request history.

## ADDED Requirements

### Requirement: Milestone schedules SHALL validate totals and sequencing
The system SHALL enforce deterministic milestone sequencing and SHALL reject milestone configurations whose total scheduled value exceeds job value.

#### Scenario: Percentage milestones exceed 100 percent
- **WHEN** submitted milestone percentages sum above 100%
- **THEN** the system rejects the schedule with a validation error

#### Scenario: Fixed milestones exceed remaining value
- **WHEN** fixed-amount milestones exceed remaining job balance
- **THEN** the system rejects the schedule with a validation error

### Requirement: Milestones SHALL preserve payment integrity after request issuance
The system SHALL prevent silent deletion or destructive mutation of milestones that already produced paid or active requests.

#### Scenario: User edits unpaid planned milestone
- **WHEN** a milestone has no linked paid request
- **THEN** the user may update allowed fields and the system recalculates outstanding schedule values

#### Scenario: User attempts to remove paid milestone
- **WHEN** a milestone linked to a paid request is targeted for deletion
- **THEN** the system rejects the deletion and requires an explicit compensating action path

### Requirement: Milestone entitlements SHALL gate advanced scheduling
The system SHALL expose multi-milestone scheduling only to entitled tiers and SHALL provide non-actionable upgrade guidance to non-entitled tiers.

#### Scenario: Non-entitled tenant opens milestone UI
- **WHEN** a tenant without milestone entitlement opens DepositGuard details
- **THEN** milestone configuration actions are unavailable and upgrade guidance is shown
