## ADDED Requirements

### Requirement: Subscription settings current-plan card reflects billing lifecycle state
The current-plan card in Settings -> Subscription SHALL adapt its labels and supporting copy based on whether the account is trialing, actively renewing, or already scheduled to end at period end.

#### Scenario: Active paid subscription shows renewal timing
- **WHEN** a user has an active renewing paid subscription and opens Settings -> Subscription
- **THEN** the current-plan card shows the renewal timing as the next billing date

#### Scenario: Trial account does not show renewal copy
- **WHEN** a user is still in the free trial and has no active paid subscription
- **THEN** the current-plan card does not show paid-renewal copy
- **AND** the surrounding cancellation area uses free-trial wording instead

#### Scenario: Scheduled cancellation shows future end wording
- **WHEN** a user's subscription is active but already marked to end at period end
- **THEN** the current-plan card shows `Cancels on [date]` instead of renewal wording
