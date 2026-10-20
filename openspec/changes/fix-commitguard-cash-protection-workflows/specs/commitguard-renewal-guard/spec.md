# Spec Delta

## MODIFIED Requirements

### Requirement: CommitGuard SHALL compute renewal warning severity from notice windows
The system SHALL derive INFO, WATCH, ACTION_REQUIRED, and URGENT severity from renewal date minus notice period and validated warning thresholds. Warnings SHALL use stable renewal-cycle/threshold identities, exclude non-active commitments, and distinguish missed notice deadlines from upcoming ones.

#### Scenario: Notice window closing soon
- **WHEN** renewal date minus notice period is within the configured urgent window
- **THEN** the commitment is surfaced as URGENT with remaining days to act

#### Scenario: Renewal not near warning windows
- **WHEN** renewal timing is outside configured warning thresholds
- **THEN** the commitment appears with INFO severity and no urgent warning state

#### Scenario: Past notice deadline
- **WHEN** a notice deadline has passed
- **THEN** the view says the deadline was missed and retains one historical alert rather than emitting a new approaching warning every day

### Requirement: CommitGuard SHALL surface renewal action context
The system SHALL present renewal date, annualized commitment impact where available, notice-period duration, and remaining decision window in renewal views and alerts. All renewal entries SHALL be reachable, and authorized owners SHALL be able to edit renewal terms after creation.

#### Scenario: User opens renewals view
- **WHEN** a user loads the CommitGuard renewals surface
- **THEN** each renewal entry includes due context needed to make retain, renegotiate, or cancel decisions

#### Scenario: More than eight renewals
- **WHEN** a tenant has more than eight eligible renewals
- **THEN** pagination or a view-all action exposes all entries without silently truncating them

#### Scenario: Renewal terms change
- **WHEN** an owner updates renewal date, notice period, or auto-renew status
- **THEN** the updated values are saved, audited, and reflected in renewal severity and future event relevance