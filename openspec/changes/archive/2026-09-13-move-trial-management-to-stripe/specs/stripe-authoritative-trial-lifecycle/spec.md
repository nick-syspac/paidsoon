## Purpose

Define Stripe as the authoritative system for trial lifecycle state so trial start, trial end, first billing date, and subscription activation are controlled by Stripe rather than local date arithmetic.

## ADDED Requirements

### Requirement: Checkout SHALL create Stripe-managed trials for eligible new subscriptions
When creating a new Stripe Checkout Session in subscription mode, the system SHALL set trial behavior through Stripe subscription data using a configurable trial period (`STRIPE_TRIAL_PERIOD_DAYS`, default 14) for plans that are eligible for self-serve trials.

#### Scenario: Eligible new subscription receives Stripe trial configuration
- **WHEN** an authenticated user without an active/trialing Stripe subscription starts checkout for an eligible self-serve plan
- **THEN** the created Checkout Session includes `mode: subscription`
- **AND** `subscription_data.trial_period_days` is set from `STRIPE_TRIAL_PERIOD_DAYS` (default 14)
- **AND** subscription/session metadata includes user and plan identity for reconciliation

#### Scenario: Trial-ineligible plan does not receive checkout trial configuration
- **WHEN** a plan is marked trial-ineligible by business rules
- **THEN** checkout does not set trial days for that plan
- **AND** billing starts according to the non-trial subscription configuration

### Requirement: Checkout SHALL preserve canonical plan-to-price mapping and avoid duplicate subscriptions
The checkout flow SHALL preserve existing plan names and per-plan Stripe Price ID mapping, SHALL reuse an existing Stripe customer when present, and SHALL reject requests that would create duplicate active or trialing subscriptions.

#### Scenario: Plan-specific price id is used for checkout
- **WHEN** a user starts checkout for a supported plan
- **THEN** the Checkout Session line item uses that plan's configured Stripe Price ID
- **AND** no fallback to a different plan price is applied

#### Scenario: Existing Stripe customer is reused
- **WHEN** the user already has a persisted Stripe customer id
- **THEN** checkout uses that customer id and does not create a second Stripe customer

#### Scenario: Duplicate active or trialing subscription creation is blocked
- **WHEN** checkout is requested for a user who already has an active or trialing Stripe subscription
- **THEN** the API rejects the request with a conflict-style response
- **AND** no additional subscription is created in Stripe

### Requirement: Application SHALL not independently expire trials during checkout
Checkout and immediate post-checkout reconciliation SHALL NOT compute, infer, or write local trial expiry timestamps independent of Stripe lifecycle events.

#### Scenario: Checkout succeeds without local trial expiry calculation
- **WHEN** checkout session creation or checkout-success reconciliation runs
- **THEN** trial access dates are sourced from Stripe subscription state
- **AND** no local-only trial expiry computation drives access decisions
