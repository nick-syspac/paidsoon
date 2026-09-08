## Purpose

Define renewal and notice-period safeguards so users can review auto-renewing commitments before notice windows close.

## ADDED Requirements

### Requirement: CommitGuard SHALL compute renewal warning severity from notice windows
The system SHALL derive renewal severities (INFO, WATCH, ACTION_REQUIRED, URGENT) from renewal date, notice period, and configured warning windows.

#### Scenario: Notice window closing soon
- **WHEN** renewal date minus notice period is within the configured urgent window
- **THEN** the commitment is surfaced as URGENT with remaining days to act

#### Scenario: Renewal not near warning windows
- **WHEN** renewal timing is outside configured warning thresholds
- **THEN** the commitment appears with INFO severity and no urgent warning state

### Requirement: CommitGuard SHALL surface renewal action context
The system SHALL present renewal date, annualized commitment impact where available, notice period, and remaining decision window in renewal views and alerts.

#### Scenario: User opens renewals view
- **WHEN** a user loads the CommitGuard renewals surface
- **THEN** each renewal entry includes due context needed to make retain, renegotiate, or cancel decisions
