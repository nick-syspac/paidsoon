## ADDED Requirements

### Requirement: New users start a 14-day free trial on signup
The system SHALL create every new user account in a `"trialing"` subscription status with a `trialEndsAt` timestamp set to 14 days after account creation. No credit card is required to start the trial.

#### Scenario: New user completes email signup
- **WHEN** a new user completes the Supabase email/password sign-up and the auth callback fires
- **THEN** the system creates a `UserProfile` with `subscriptionStatus: "trialing"` and `trialEndsAt: createdAt + 14 days`

#### Scenario: Returning user signs in again during trial
- **WHEN** a user who already has a profile signs in again
- **THEN** the system does not overwrite `subscriptionStatus` or `trialEndsAt` (upsert `update: {}` is a no-op)

### Requirement: New users are routed through an onboarding plan picker before accessing the dashboard
The system SHALL redirect new users (those with `onboardingCompletedAt: null`) to `/onboarding` after authentication, where they must choose a subscription plan before being admitted to the dashboard.

#### Scenario: First sign-in after account creation
- **WHEN** a user with `onboardingCompletedAt: null` lands on `/auth/callback`
- **THEN** the system redirects to `/onboarding` rather than `/dashboard`

#### Scenario: Returning user who has completed onboarding
- **WHEN** a user with `onboardingCompletedAt` set signs in
- **THEN** the system redirects to `/dashboard` as normal

#### Scenario: Direct navigation to /onboarding after completing it
- **WHEN** a user with `onboardingCompletedAt` set navigates directly to `/onboarding`
- **THEN** the system redirects to `/dashboard` (idempotent)

### Requirement: Onboarding plan picker saves the user's chosen plan and marks onboarding complete
The system SHALL allow users on `/onboarding` to select one of the three available subscription tiers. On selection, the system SHALL persist `subscriptionTier` and `onboardingCompletedAt` to the user's profile and redirect to `/dashboard`.

#### Scenario: User selects a plan on /onboarding
- **WHEN** a user submits a plan choice on `/onboarding`
- **THEN** the system writes `subscriptionTier` = chosen tier and `onboardingCompletedAt` = now to `UserProfile` via `PATCH /api/onboarding`
- **THEN** the user is redirected to `/dashboard`

#### Scenario: Invalid tier submitted to /api/onboarding
- **WHEN** a request to `PATCH /api/onboarding` contains a tier value not in `["starter", "solo", "small_business"]`
- **THEN** the system returns HTTP 400

### Requirement: Dashboard shows a trial countdown banner during the trial window
The system SHALL display a persistent banner in the dashboard layout for users whose `subscriptionStatus` is `"trialing"` and `trialEndsAt` is in the future, showing the number of days remaining and a link to add payment.

#### Scenario: User with active trial visits dashboard
- **WHEN** a user with `subscriptionStatus: "trialing"` and `trialEndsAt > now` loads any dashboard page
- **THEN** a banner is shown with the number of days remaining and an "Add payment" link to `/billing/checkout?plan=<tier>`

#### Scenario: User with no trial (existing subscriber) visits dashboard
- **WHEN** a user with `subscriptionStatus: "active"` (or `trialEndsAt: null`) loads the dashboard
- **THEN** no trial banner is displayed

### Requirement: Dashboard is gated after trial expiry
The system SHALL redirect users whose trial has expired (`subscriptionStatus === "trialing"` and `trialEndsAt < now`) away from the dashboard to the Stripe checkout page for their chosen plan.

#### Scenario: Trial-expired user navigates to any dashboard page
- **WHEN** a user with `subscriptionStatus: "trialing"` and `trialEndsAt` in the past loads the dashboard layout
- **THEN** the system redirects to `/billing/checkout?plan=<tier>&reason=trial_expired`

#### Scenario: Trial-expired user completes payment
- **WHEN** the Stripe `checkout.session.completed` webhook fires for the user
- **THEN** `subscriptionStatus` is set to `"active"` and `trialEndsAt` is cleared
- **THEN** the user can access the dashboard without the trial gate

### Requirement: Trial users see higher-tier features blurred with an upgrade CTA
The system SHALL render higher-tier features as blurred/locked for trial users, consistent with the existing plan-gating behaviour for paid subscribers on a lower tier.

#### Scenario: Trial user on "solo" plan views a Small Business-only feature
- **WHEN** a user with `subscriptionTier: "solo"` and `subscriptionStatus: "trialing"` views a feature gated to `small_business`
- **THEN** the feature is blurred and an upgrade CTA is shown, identical to a paid solo subscriber viewing the same feature
