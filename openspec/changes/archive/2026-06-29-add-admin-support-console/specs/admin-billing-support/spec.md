## ADDED Requirements

### Requirement: Billing and subscription state are inspectable
The system MUST allow admins to inspect plan, subscription status, trial status, next billing date, failed payment status, Stripe customer ID, Stripe subscription ID, current usage, plan limits, and recent Stripe events.

#### Scenario: Billing state is visible
- **WHEN** an admin opens the billing support view
- **THEN** the page shows the subscription and billing state

#### Scenario: Stripe identifiers are masked or bounded
- **WHEN** the billing view renders
- **THEN** it does not expose more sensitive billing data than needed

### Requirement: Billing actions are audited and reasoned
Admins SHOULD be able to sync billing from Stripe, resend checkout links, resend billing portal links, extend trials, apply coupons or discounts, upgrade or downgrade plans, cancel subscriptions, reactivate subscriptions, temporarily override limits, and mark accounts as internal, free, or demo. Billing actions MUST require a reason and an audit log entry.

#### Scenario: Trial extension requires reason
- **WHEN** an admin extends a trial
- **THEN** the action requires a reason and is audited

#### Scenario: Plan changes are logged
- **WHEN** an admin upgrades or downgrades a subscription
- **THEN** the before and after billing state is stored in the audit log
