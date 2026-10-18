# Spec Delta

## MODIFIED Requirements

### Requirement: Allowance period anchored to the billing period
The system SHALL measure subscription allowance over its billing period, trials over their trial window, and otherwise the current Australia/Melbourne month. When admin-granted access is effective, usage SHALL use the granted plan and its stable access window, not inactive billing dates. Extensions and plan changes of a current grant SHALL preserve its window start and consumed usage. A genuinely new grant after lapse/revocation SHALL start a new window.

#### Scenario: New billing period begins
- **WHEN** an account's subscription billing period rolls over
- **THEN** usage for the new period starts at zero and held invoices become eligible subject to current access

#### Scenario: Account is in trial
- **WHEN** allowance usage is calculated for a trialing account
- **THEN** usage is counted over its applicable trial window

#### Scenario: Account has neither a billing period nor a trial window
- **WHEN** an account has no recorded billing period, trial window or effective grant window
- **THEN** accounting of allowance uses the current calendar month in Australia/Melbourne
- **AND** a fallback accounting window alone does not authorize sending

#### Scenario: Grant extension does not reset quota
- **WHEN** the current grant's expiry or plan changes
- **THEN** its original window start and first-chase consumption remain counted
- **AND** the selected plan's existing limit is applied without a quota reset

#### Scenario: Fresh grant after lapse
- **WHEN** a new explicit grant starts after the prior grant expired or was revoked
- **THEN** its new access window starts at grant activation and uses the selected plan's limit
- **AND** already-chased invoices are not charged another allowance unit merely because a new window began

### Requirement: Sequences in progress are never interrupted
The system SHALL continue remaining reminders of an already-started sequence regardless of remaining allowance while an independent valid access source authorizes sending. Allowance exhaustion SHALL NOT interrupt a sequence; expired/revoked access SHALL NOT be bypassed by an in-progress sequence. Existing invoices and sequence state SHALL be retained.

#### Scenario: Account reaches capacity mid-sequence
- **WHEN** an account consumes its full allowance while sequences are underway and access remains valid
- **THEN** remaining reminders continue on schedule

#### Scenario: Grant expires after a job was queued
- **WHEN** grant-backed access expires or is revoked before a queued reminder executes and no other valid access exists
- **THEN** execution skips sending even for an already-started sequence
- **AND** no extra allowance is consumed or email delivered
- **AND** invoice/sequence state is preserved for later authorized continuation