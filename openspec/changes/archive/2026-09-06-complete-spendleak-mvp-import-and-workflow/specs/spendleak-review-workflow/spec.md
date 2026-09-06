## Purpose

Convert SpendLeak findings into owner decisions that are persisted, visible, and operationally useful, so users can track what to keep versus what to act on.

## ADDED Requirements

### Requirement: SpendLeak SHALL support owner review actions for findings
The system SHALL allow an owner to classify each SpendLeak finding with one of four MVP actions: keep, cancel, renegotiate, or ignore.

#### Scenario: Owner applies an action
- **WHEN** an authenticated owner selects keep, cancel, renegotiate, or ignore for an eligible finding
- **THEN** the system persists the selected action
- **AND** the finding lifecycle state reflects that reviewed outcome

#### Scenario: Invalid action request
- **WHEN** an action outside the supported MVP set is submitted
- **THEN** the system rejects the request
- **AND** existing finding state remains unchanged

### Requirement: Review decisions SHALL be auditable and reversible
The system SHALL retain decision metadata needed to understand who made the decision and when, and SHALL allow reopening a previously reviewed finding.

#### Scenario: Reviewed finding is reopened
- **WHEN** the owner reopens a finding previously marked with keep, cancel, renegotiate, or ignore
- **THEN** the finding returns to an actionable open state
- **AND** the historical decision trail remains queryable

#### Scenario: Tenant-safe decision updates
- **WHEN** a user attempts to modify a finding owned by another tenant
- **THEN** the request is denied
- **AND** no cross-tenant state changes occur

### Requirement: Keep and ignore decisions SHALL suppress repeat unresolved noise
The system SHALL avoid repeatedly presenting findings with active keep or ignore decisions as new unresolved actions unless new evidence materially changes the finding.

#### Scenario: Suppressed finding reappears without new evidence
- **WHEN** detection reruns and produces the same finding subject without material evidence change
- **THEN** the prior keep or ignore decision remains in effect
- **AND** the finding is not surfaced as a new unresolved review item

#### Scenario: Material evidence change after suppression
- **WHEN** evidence for a suppressed finding changes materially on a later sync or import
- **THEN** the system may reopen the finding for review
- **AND** indicates that suppression was overridden by new evidence