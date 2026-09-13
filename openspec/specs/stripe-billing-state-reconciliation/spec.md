# stripe-billing-state-reconciliation Specification

## Purpose
Define an idempotent Stripe webhook reconciliation contract that keeps `UserProfile` subscription state synchronized from authoritative Stripe events and resilient to duplicate or out-of-order delivery.
## Requirements
### Requirement: Billing webhook SHALL verify Stripe signatures before processing
The billing webhook SHALL validate the Stripe signature with the configured webhook secret and SHALL reject invalid signatures before any persistence.

#### Scenario: Invalid signature is rejected
- **WHEN** a webhook request has a missing or invalid Stripe signature
- **THEN** the endpoint returns an error response indicating signature verification failure
- **AND** no subscription state is written to the database

### Requirement: Billing webhook SHALL handle required Stripe lifecycle events idempotently
The system SHALL process these events idempotently: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`.

#### Scenario: Duplicate event delivery is a safe no-op
- **WHEN** Stripe retries delivery for an already-processed event
- **THEN** the endpoint returns a success response
- **AND** subscription state remains logically unchanged after reprocessing

#### Scenario: Out-of-order older event does not overwrite newer state
- **WHEN** an older subscription event arrives after a newer event for the same subscription
- **THEN** the webhook detects the stale update
- **AND** the older event does not overwrite newer persisted subscription status, tier, or period dates

### Requirement: User resolution SHALL support metadata and Stripe identifiers
Webhook handlers SHALL resolve the target tenant by subscription metadata, Stripe customer id, or Stripe subscription id, so updates remain possible even when one identifier is missing in a specific event type.

#### Scenario: Metadata-based resolution on checkout completion
- **WHEN** `checkout.session.completed` includes user metadata
- **THEN** the webhook resolves and updates that user's profile

#### Scenario: Identifier fallback resolution for sparse payloads
- **WHEN** event metadata is absent or incomplete but customer or subscription identifiers are present
- **THEN** the webhook resolves the profile through stored Stripe identifiers and continues reconciliation

### Requirement: Stripe lifecycle fields SHALL be persisted from Stripe timestamps
Webhook processing SHALL persist supported subscription fields from Stripe data, including customer id, subscription id, status, trial end, current period end, price id, cancellation-at-period-end state, and subscription tier mapping.

#### Scenario: Subscription create/update persists lifecycle fields
- **WHEN** subscription create or update events are processed
- **THEN** Unix-second Stripe timestamps are converted safely to JavaScript dates
- **AND** persisted fields reflect the Stripe payload snapshot

#### Scenario: Subscription delete revokes access state
- **WHEN** `customer.subscription.deleted` is processed
- **THEN** the persisted status reflects cancellation and access-revoking state
- **AND** cancellation-related flags are reconciled consistently

