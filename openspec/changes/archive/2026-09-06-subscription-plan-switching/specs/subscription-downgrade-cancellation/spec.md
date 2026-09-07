## ADDED Requirements

### Requirement: Show pending downgrade state on current plan card
When `pendingDowngradeTier` is set, the current plan card SHALL show the scheduled change and a cancel button.

#### Scenario: Pending state visible after scheduling
- **WHEN** the user views Settings → Subscription and `pendingDowngradeTier` is set
- **THEN** the current plan card shows "Downgrading to [plan] on [date]" and a "Cancel scheduled downgrade" button

#### Scenario: No pending state shown when none scheduled
- **WHEN** `pendingDowngradeTier` is null
- **THEN** no pending downgrade indicator is shown

### Requirement: User can cancel a scheduled downgrade
`DELETE /api/billing/downgrade` SHALL release the Stripe Subscription Schedule and clear `pendingDowngradeTier` and `stripeScheduleId` from `UserProfile`.

#### Scenario: Authenticated user cancels pending downgrade
- **WHEN** an authenticated user with a pending downgrade calls `DELETE /api/billing/downgrade`
- **THEN** the Stripe Subscription Schedule is released
- **AND** `pendingDowngradeTier` and `stripeScheduleId` are set to null in `UserProfile`
- **AND** HTTP 200 is returned

#### Scenario: No pending downgrade — cancel rejected
- **WHEN** `DELETE /api/billing/downgrade` is called but no `stripeScheduleId` is set on the profile
- **THEN** HTTP 400 is returned

#### Scenario: Unauthenticated cancel rejected
- **WHEN** `DELETE /api/billing/downgrade` is called without a valid session
- **THEN** HTTP 401 is returned

### Requirement: UI reflects cancelled downgrade immediately
After a successful cancel, the UI SHALL revert the current plan card to its normal state (no pending indicator).

#### Scenario: Cancel button removes pending state
- **WHEN** the user clicks "Cancel scheduled downgrade" and `DELETE /api/billing/downgrade` returns HTTP 200
- **THEN** the "Downgrading to…" indicator is removed and the plan card shows the normal current plan state

### Requirement: Pending state cleared by webhook on schedule release
The billing webhook SHALL handle `customer.subscription_schedule.released` and clear `pendingDowngradeTier` and `stripeScheduleId` on the matching `UserProfile`.

#### Scenario: Out-of-band release clears DB state
- **WHEN** a Subscription Schedule is released via the Stripe dashboard or any means outside the app
- **THEN** `customer.subscription_schedule.released` fires and `pendingDowngradeTier` + `stripeScheduleId` are set to null in `UserProfile`
