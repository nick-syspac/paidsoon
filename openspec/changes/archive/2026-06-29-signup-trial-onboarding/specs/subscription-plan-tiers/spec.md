## ADDED Requirements

### Requirement: Subscription status supports a trialing state
The system SHALL accept `"trialing"` as a valid value for `UserProfile.subscriptionStatus`, in addition to the existing `"active"`, `"cancelled"`, and `"past_due"` values. Feature gating SHALL treat `"trialing"` identically to `"active"` for features within the user's chosen tier.

#### Scenario: Trial user accesses a feature within their chosen tier
- **WHEN** a user with `subscriptionStatus: "trialing"` and `subscriptionTier: "solo"` accesses a Solo-tier feature
- **THEN** the feature is available, identical to a paid `"active"` Solo subscriber

#### Scenario: Trial user accesses a feature above their chosen tier
- **WHEN** a user with `subscriptionStatus: "trialing"` and `subscriptionTier: "solo"` accesses a Small Business-only feature
- **THEN** the feature is locked with an upgrade CTA, identical to a paid Solo subscriber

### Requirement: UserProfile stores trial expiry date
The system SHALL store a nullable `trialEndsAt DateTime?` field on `UserProfile`. This field is set at account creation for new users and cleared when the user converts to a paid subscription.

#### Scenario: New user profile is created
- **WHEN** `createUserProfile` is called for a new user
- **THEN** `trialEndsAt` is set to 14 days after the current timestamp

#### Scenario: User converts to paid subscription
- **WHEN** the Stripe `checkout.session.completed` webhook processes a successful payment for a previously trialing user
- **THEN** `trialEndsAt` is set to `null`

### Requirement: UserProfile tracks onboarding completion
The system SHALL store a nullable `onboardingCompletedAt DateTime?` field on `UserProfile`. This field is null until the user completes the onboarding plan picker, at which point it is set to the current timestamp.

#### Scenario: User completes onboarding
- **WHEN** `PATCH /api/onboarding` is called with a valid tier
- **THEN** `onboardingCompletedAt` is set to the current timestamp on the user's profile

#### Scenario: Profile created before this change (existing users)
- **WHEN** an existing user profile has `onboardingCompletedAt: null`
- **THEN** the auth callback treats the null as "onboarding complete" for pre-existing accounts (determined by checking `subscriptionStatus !== "trialing"`)
