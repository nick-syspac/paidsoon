## MODIFIED Requirements

### Requirement: Mark subscription status as past due on payment failure
The system SHALL set `UserProfile.subscriptionStatus` to `"past_due"` when an `invoice.payment_failed` event is received for a subscription renewal invoice, identified by looking up the `UserProfile` via the invoice's Stripe customer ID.

#### Scenario: Renewal invoice payment fails
- **WHEN** the `stripe-billing` webhook receives an `invoice.payment_failed` event for a customer with a matching `UserProfile`
- **THEN** that `UserProfile.subscriptionStatus` is updated to `"past_due"`

#### Scenario: No matching UserProfile
- **WHEN** the `stripe-billing` webhook receives an `invoice.payment_failed` event for a Stripe customer ID with no matching `UserProfile`
- **THEN** the webhook returns a 200 response and makes no database changes

### Requirement: Feature access is unaffected by a past-due status
The system SHALL NOT change `UserProfile.subscriptionTier` or restrict tier-gated features solely because `subscriptionStatus` became `"past_due"`; access is only revoked by an explicit `customer.subscription.deleted` event.

#### Scenario: Past-due user retains their tier's features
- **WHEN** a user's `subscriptionStatus` becomes `"past_due"` due to a failed payment
- **THEN** `hasPlanFeature`/`requireFeature` checks continue to evaluate against that user's existing `subscriptionTier`, unchanged
