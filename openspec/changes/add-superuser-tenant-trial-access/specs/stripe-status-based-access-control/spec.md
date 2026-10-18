# Spec Delta

## MODIFIED Requirements

### Requirement: Access decisions SHALL use Stripe-backed subscription status matrix
Subscription-controlled access SHALL use Stripe-backed status as its primary billing source and separately resolve explicit admin grants. Paid access SHALL take precedence. Valid grants SHALL apply only when billing eligibility permits them, with their selected plan and exclusive expiry. Missing profiles or unknown states SHALL NOT grant access. Existing bounded pre-checkout onboarding trials SHALL remain a distinct non-Stripe source.

#### Scenario: Trialing status grants trial access
- **WHEN** a tenant's synchronized Stripe subscription status is `trialing`
- **THEN** trial-level access is granted according to its Stripe plan tier
- **AND** the Stripe trial date is not replaced by an admin grant or account-age calculation

#### Scenario: Active status grants paid access
- **WHEN** a tenant's synchronized Stripe subscription status is `active`
- **THEN** paid access is granted according to its paid plan tier
- **AND** retained grants cannot replace, downgrade or upgrade paid entitlements

#### Scenario: Past-due status retains access with warning
- **WHEN** a tenant's synchronized subscription status is `past_due`
- **THEN** existing grace access remains temporarily available under its billing plan
- **AND** billing-warning state is exposed to the UI
- **AND** grants cannot increase or replace that grace access

#### Scenario: Unpaid or canceled status revokes access
- **WHEN** a tenant's subscription status is `unpaid` or `canceled`
- **THEN** subscription-derived access is revoked
- **AND** only a separately valid, eligible grant may provide application access for a debt-free canceled account; unpaid accounts cannot use grants

#### Scenario: Incomplete status does not grant full access
- **WHEN** a tenant's synchronized subscription status is `incomplete`
- **THEN** full subscription access is not granted and grants cannot bypass checkout/payment completion

#### Scenario: Grant expires without cleanup
- **WHEN** server time is equal to or later than a grant's recorded expiry, even if no cleanup job ran
- **THEN** that grant supplies no access, features or allowance to any new page/API authorization or job execution
- **AND** independent valid access is still honored

#### Scenario: Granted plan is enforced everywhere
- **WHEN** an eligible tenant uses a valid Small Business grant
- **THEN** pages, APIs, feature gates, quotas and background jobs use Small Business's existing features and limits
- **AND** they do not use the inactive billing plan or bypass implementation-gated features

#### Scenario: Independent trial sources overlap
- **WHEN** a current Stripe trial and an eligible retained admin grant provide different future expiries
- **THEN** current plan/source follows Stripe precedence and effective trial expiry reflects the latest independent valid expiry
- **AND** expiry provenance and the later grant's applicable plan are shown separately
- **AND** duration extension starts from the later of now or that full effective trial expiry

#### Scenario: Legacy pre-checkout trial remains bounded
- **WHEN** a tenant has no Stripe subscription and only its existing signup trial
- **THEN** that trial provides its existing plan only before its recorded expiry
- **AND** after expiry only a valid explicit grant or new subscription can restore gated access

### Requirement: Subscription UI SHALL display Stripe-synchronized lifecycle dates and warnings
Billing views SHALL show persisted Stripe billing state independently from effective application access, including plan, status, Stripe trial/billing dates and cancellation state. Grant-backed access SHALL additionally show effective plan, grant expiry and source without implying a billing change. Billing-resolution and checkout routes SHALL remain reachable without subscription access.

#### Scenario: Trial user sees Stripe-backed trial end and first payment messaging
- **WHEN** a Stripe-trialing tenant opens billing settings
- **THEN** trial end and first payment timing are shown from synchronized Stripe dates

#### Scenario: Warning statuses show actionable billing notice
- **WHEN** a tenant is `past_due`, `incomplete`, or `unpaid`
- **THEN** billing UI shows an appropriate actionable warning unaffected by retained grants

#### Scenario: Grant user sees accurate access timing
- **WHEN** a grant-backed tenant opens the dashboard banner or subscription settings
- **THEN** the effective plan and access expiry are shown with application-only labeling
- **AND** existing Stripe charge dates remain separate and no postponed-charge claim is made

### Requirement: Local trial date arithmetic SHALL NOT independently control access
Account-age heuristics SHALL NOT grant or revoke Stripe subscription access. Explicit admin grant expiries SHALL control only application grants and SHALL NOT be persisted as Stripe trial dates. Existing no-subscription onboarding dates SHALL be treated as bounded onboarding access, not evidence of Stripe billing state.

#### Scenario: Account-age-only check cannot grant trial access
- **WHEN** an account is within a local age range but lacks a valid subscription, bounded onboarding trial or explicit grant
- **THEN** the date range alone grants no access

#### Scenario: Stripe-backed status overrides stale local trial dates
- **WHEN** legacy local trial date fields are stale or absent for a Stripe-backed subscription
- **THEN** subscription-derived access still follows synchronized Stripe status
- **AND** explicit grant dates are considered separately, never as replacement Stripe dates

## ADDED Requirements

### Requirement: Platform owner internal access SHALL be a narrow fresh fallback

After real Stripe, eligible grant and bounded onboarding access, the resolver SHALL allow `platform_owner` application access only for an existing exactly `active` profile with a recognized existing tier, no linked Stripe subscription, no blocking or unknown risk and a fresh database-verified role exactly `platform_owner` with status exactly `active`. Missing/unavailable role facts SHALL fail closed. This SHALL NOT change ordinary customer access, auth/elevation, catalog quotas, Stripe eligibility or purchased-plan controls, and SHALL NOT fabricate subscriptions or trials.

#### Scenario: Eligible internal owner uses existing catalog plan
- **WHEN** the target profile satisfies every internal-owner condition and no higher-precedence source provides access
- **THEN** dashboard, APIs, chase, reminders, AI and system jobs use its existing tier and unchanged limits with source `platform_owner`
- **AND** effective/trial expiries and expiry provenance are null and presentation labels it “Platform owner internal access”, not paid/trial access

#### Scenario: Role or billing facts cannot broaden the fallback
- **WHEN** role is missing, revoked, disabled, unknown, support/admin, belongs only to the operator, or the profile is canceled/paused/delinquent/incomplete/trialing/unknown, linked, missing or has unknown tier or blocking/unknown risk
- **THEN** the owner fallback supplies no access and independent existing access policy remains unchanged

#### Scenario: Fresh scoped role reads preserve tenant isolation
- **WHEN** access is loaded or an admin target/operation/notification is projected
- **THEN** a server-only privileged lookup reads only the target owner's platform-role facts, without caching, and tenant data retains its existing RLS boundary
- **AND** batch loads use one requested-ID role query rather than N+1 and no raw role row or internal boolean enters returned profile/client data

### Requirement: Onboarding plan selection SHALL remain non-authoritative intent

Onboarding completion SHALL record completion without changing billing or access authority. A selected public plan SHALL be Checkout intent only, not an activated plan or a new trial. Existing signup, eligible grant and verified Stripe access SHALL retain their plan, dates and precedence. Onboarding copy SHALL describe selection and continuation, not promise a card-free selected-plan trial.

#### Scenario: Signup Essentials access survives a different selection

- **WHEN** a tenant with an existing signup Essentials trial completes onboarding selecting any of the four public plans
- **THEN** only onboarding completion and its lifecycle timestamp are persisted through authenticated tenant-scoped access
- **AND** the selected plan does not change the stored subscription tier, trial expiry or effective Essentials features and limits

#### Scenario: Grant or Stripe authority survives onboarding

- **WHEN** onboarding is completed or retried for a tenant with an eligible grant or verified Stripe access
- **THEN** selection cannot replace the effective plan/source, extend trial dates, change billing state or alter entitlement version/reservations
- **AND** denied or expired access is not restored by selection or completion

#### Scenario: Invalid selection cannot complete onboarding

- **WHEN** the completion request is unauthenticated or selects a hidden, unknown or non-public plan
- **THEN** it is rejected without recording completion or changing billing/access authority
- **AND** no billing object is created

#### Scenario: Completed and paid tenants skip the picker

- **WHEN** a tenant has already completed onboarding or directly visits onboarding with an active Stripe-backed paid subscription
- **THEN** the tenant is redirected to the dashboard without a plan-selection mutation or forced Checkout
- **AND** auth callback routing continues to send only trialing profiles with incomplete onboarding to onboarding

#### Scenario: Selection copy does not promise activated trial benefits

- **WHEN** a tenant views or submits the onboarding plan picker
- **THEN** labels describe selecting a plan and continuing to Checkout, not starting a fresh card-free 14-day trial of that plan
- **AND** messaging distinguishes intended purchase from existing effective access without promising changed charges

### Requirement: Invoice source limits SHALL use authorized effective access

Stripe, Xero and MYOB source-limit decisions SHALL use the current allowed effective plan, never onboarding selection intent or an inactive billing tier. Existing source counting and reconnect behavior SHALL remain unchanged. Denied access SHALL NOT become Essentials authorization, and grant-backed limits SHALL NOT resume or modify a Stripe subscription.

#### Scenario: Each granted public plan uses its existing cap

- **WHEN** an eligible grant-backed tenant connects through Stripe authorize/callback, Xero connect/callback/organisation selection or MYOB connect/callback
- **THEN** source-limit checks use one source for Essentials, Business Control and Small Business, or three for Business Pro
- **AND** a new source at the cap is rejected using the existing route outcome without changing Stripe billing state

#### Scenario: Expiry or intent cannot elevate connection capacity

- **WHEN** access is denied or a grant expires before the applicable source-limit decision, or the intended Checkout plan differs from effective access
- **THEN** denied access cannot fall back to Essentials and selected-plan intent cannot supply capacity
- **AND** paused or canceled Stripe state remains unchanged by the grant or connection attempt