## ADDED Requirements

### Requirement: Free and Pro subscription tiers exist
The system SHALL support two tiers: Free and Pro ($19/month). Tier is stored as `subscriptionTier` on `user_profiles`. All new accounts start on Free.

#### Scenario: New account defaults to Free
- **WHEN** a new user completes registration
- **THEN** their `user_profiles.subscriptionTier` is `'free'`

---

### Requirement: Freelancer can upgrade to Pro via Stripe Billing
The system SHALL allow a Free-tier user to upgrade to Pro by initiating a Stripe Checkout session for the $19/month plan. Upon successful payment, the system SHALL update `subscriptionTier` to `'pro'`.

#### Scenario: Successful upgrade to Pro
- **WHEN** a user completes the Stripe Checkout flow for the Pro plan
- **THEN** the system receives a `checkout.session.completed` webhook, updates `subscriptionTier` to `'pro'`, and the user sees Pro features immediately

#### Scenario: Payment failure during upgrade
- **WHEN** a user's payment fails during Stripe Checkout
- **THEN** `subscriptionTier` remains `'free'` and the user sees a payment failure message

---

### Requirement: Freelancer can cancel their Pro subscription
The system SHALL allow a Pro user to cancel their subscription via a Stripe Billing portal link. Upon cancellation, the subscription remains active until the end of the billing period, then `subscriptionTier` reverts to `'free'`.

#### Scenario: Subscription cancelled at period end
- **WHEN** Stripe sends `customer.subscription.deleted` at the end of the billing period
- **THEN** the system sets `subscriptionTier` to `'free'` and `subscriptionStatus` to `'cancelled'`

#### Scenario: Free tier limits re-enforced on downgrade
- **WHEN** a user's Pro subscription ends and they have more than 3 active tracked invoices
- **THEN** invoices beyond the first 3 (ordered by `nextEmailAt` ascending) are set to `status: 'paused'` and the user is notified via email

---

### Requirement: Stripe Billing webhook endpoint processes subscription events
The system SHALL expose a `/api/webhooks/stripe-billing` endpoint that receives and verifies platform Stripe webhook events. It SHALL handle at minimum: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

#### Scenario: Valid billing webhook processed
- **WHEN** Stripe sends a valid signed event to `/api/webhooks/stripe-billing`
- **THEN** the system updates the relevant `user_profiles` record and returns HTTP 200

#### Scenario: Invalid billing webhook signature
- **WHEN** a request arrives at `/api/webhooks/stripe-billing` with an invalid signature
- **THEN** the system SHALL return HTTP 400 and SHALL NOT update any records

---

### Requirement: Tier-based feature enforcement
The system SHALL enforce tier restrictions at both the UI and API layers. Free-tier users SHALL NOT be able to access Pro features by navigating directly to URLs or making direct API calls.

#### Scenario: Free user attempts Pro API action
- **WHEN** a Free-tier user calls an API endpoint reserved for Pro (e.g., updating custom from-address)
- **THEN** the API returns HTTP 403 with a message indicating a Pro subscription is required
