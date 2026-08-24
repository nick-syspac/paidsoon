## Purpose

Lets customers end paid billing without ambiguity, while keeping free-trial accounts out of the Stripe cancellation path and making pending period-end cancellation status clear in settings.

## ADDED Requirements

### Requirement: Paid subscribers can start cancellation from subscription settings
The system SHALL provide an explicit cancellation action in Settings -> Subscription for authenticated users who have an active Stripe billing subscription. Triggering the action SHALL open a dedicated confirmation page first; only after the user confirms there SHALL the system send them into a Stripe-hosted cancellation flow for that specific subscription rather than a generic billing-portal homepage.

#### Scenario: Active subscriber opens confirmation page
- **WHEN** an authenticated user with an active Stripe subscription clicks the cancellation action in Settings -> Subscription
- **THEN** the browser navigates to a dedicated confirmation page that explains the cancellation impact before any Stripe portal session is created

#### Scenario: Confirmed cancellation opens Stripe cancellation flow
- **WHEN** the user confirms cancellation from the dedicated confirmation page
- **THEN** the system creates a Stripe Billing Portal session for the `subscription_cancel` flow scoped to that subscription
- **AND** the browser is redirected to the returned Stripe URL

#### Scenario: Missing session is rejected
- **WHEN** the cancellation route is called without an authenticated session
- **THEN** the system returns HTTP 401 and does not create a Stripe portal session

#### Scenario: No active Stripe subscription is rejected
- **WHEN** the cancellation route is called for a user who has no active Stripe subscription
- **THEN** the system returns HTTP 400 and does not create a Stripe customer as a side effect

### Requirement: Trial-only accounts stay out of the Stripe cancellation path
The subscription settings page SHALL distinguish between a free-trial account and a paid subscription. Users whose account is still in the DB-side free trial without an active Stripe subscription SHALL be able to start a cancellation flow from Settings -> Subscription, and the flow SHALL confirm that they are ending their free trial locally rather than cancelling a Stripe subscription.

#### Scenario: Trial account shows trial-specific state
- **WHEN** a user with `subscriptionStatus = "trialing"` and no active Stripe subscription opens Settings -> Subscription
- **THEN** the page shows `End free trial` copy and still offers a cancellation action
- **AND** it explains that no paid subscription is active yet

#### Scenario: Trial account ends trial without Stripe
- **WHEN** a trial-only account confirms cancellation from the dedicated cancellation page
- **THEN** the system ends the free trial locally without creating a Stripe customer or portal session
- **AND** the user is redirected back to Settings -> Subscription

#### Scenario: Trial account reaches confirmation page
- **WHEN** a trial-only account navigates to the cancellation confirmation page
- **THEN** the page explains that the user is ending a free trial, asks `Are you sure?`, and does not mention Stripe cancellation

### Requirement: Pending cancellation is shown as a scheduled future end
When Stripe marks a paid subscription to cancel at period end, the subscription settings page SHALL present that state as a scheduled future end rather than an already-ended subscription.

#### Scenario: Scheduled cancellation copy shows end date
- **WHEN** the user returns to Settings -> Subscription after scheduling cancellation for period end
- **THEN** the current plan card shows `Cancels on [date]`
- **AND** supporting copy explains that access remains active until that date and billing stops after it

#### Scenario: Pending cancellation state survives page reload
- **WHEN** a subscription has already been marked to cancel at period end in Stripe and the user reloads Settings -> Subscription later
- **THEN** the page still shows the scheduled-cancellation state using locally persisted subscription data

### Requirement: Stripe return path confirms the scheduled cancellation
After the Stripe-hosted cancellation flow completes successfully, the user SHALL return to the subscription settings page with a confirmation message that reflects the scheduled end date.

#### Scenario: Successful return from Stripe shows confirmation
- **WHEN** the user completes the Stripe cancellation flow and is redirected back to the app
- **THEN** Settings -> Subscription shows a success notice indicating that cancellation is scheduled for the subscription end date
