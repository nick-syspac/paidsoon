# subscription-payment-failure-handling Specification

## Purpose

Defines how a failed Stripe subscription-renewal payment is reflected on
the affected user's account without changing their feature-gating tier
during the grace period.
## Requirements
### Requirement: Mark subscription status as past due on payment failure
The system SHALL set `UserProfile.subscriptionStatus` to `past_due` when an `invoice.payment_failed` event is received for a subscription renewal invoice, identified by resolving the account via Stripe customer or subscription identifiers.

#### Scenario: Renewal invoice payment fails
- **WHEN** the `stripe-billing` webhook receives an `invoice.payment_failed` event for a customer with a matching `UserProfile`
- **THEN** that `UserProfile.subscriptionStatus` is updated to `past_due`

#### Scenario: No matching UserProfile
- **WHEN** the `stripe-billing` webhook receives an `invoice.payment_failed` event for Stripe identifiers with no matching `UserProfile`
- **THEN** the webhook returns a success response and makes no database changes

### Requirement: Feature access is unaffected by a past-due status
The system SHALL NOT change `UserProfile.subscriptionTier` or immediately revoke tier-gated features solely because `subscriptionStatus` became `past_due`; access revocation occurs only for revoking statuses (such as `unpaid` or `canceled`) from Stripe lifecycle updates.

#### Scenario: Past-due user retains their tier's features
- **WHEN** a user's `subscriptionStatus` becomes `past_due` due to a failed payment
- **THEN** `hasPlanFeature` and `requireFeature` continue to evaluate against that user's existing `subscriptionTier`, unchanged

