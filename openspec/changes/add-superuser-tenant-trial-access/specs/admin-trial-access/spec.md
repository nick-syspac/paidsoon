# Spec Delta

## Purpose

Allow the platform owner to manage bounded evaluation access for an existing PaidSoon customer tenant without bypassing billing obligations or changing unrelated subscription access.

## ADDED Requirements

### Requirement: Trial management SHALL be restricted to the elevated platform owner
Every trial-management read, preview, mutation, recovery and notification retry SHALL require an active `platform_owner` role and valid elevated session. The target organisation SHALL be the existing single-owner tenant billing account, not a debtor customer or individual entitlement independent of that account.

#### Scenario: Platform owner manages a tenant
- **WHEN** an authenticated platform owner with a valid elevated session targets an existing tenant
- **THEN** trial management is permitted within that tenant scope
- **AND** the acting identity is obtained from server authentication, not the payload

#### Scenario: Other roles cannot manage trials
- **WHEN** an ordinary customer, customer admin, platform support, platform admin, disabled owner, or unelevated owner calls any trial-management endpoint
- **THEN** the request is rejected with the existing authentication or authorization response
- **AND** no grant, Stripe mutation, or notification occurs

#### Scenario: Tenant identifiers cannot cross scopes
- **WHEN** a request targets a missing tenant, debtor identifier, or grant/operation belonging to another tenant
- **THEN** the request is rejected without revealing unrelated tenant details or changing access

### Requirement: Recovery SHALL distinguish original attribution from current elevation

Preview confirmation SHALL remain bound to the original actor and original elevated session. Operation recovery and its read-only status lookup SHALL require that same original actor with a currently active `platform_owner` role and valid elevated session, but SHALL NOT require the original session ID. Another owner actor SHALL NOT substitute. The operation's `adminSessionId` SHALL remain immutable as the original session. This recovery/status exception SHALL NOT relax preview confirmation, other mutation or notification retry authorization.

#### Scenario: Original actor recovers in a newly elevated session

- **WHEN** the original session has expired and the same original actor obtains a valid new elevated session while still an active platform owner
- **THEN** the actor may read the tenant-scoped operation status and recover its uncertain outcome using the frozen intent and existing recovery safeguards
- **AND** the operation retains its original `adminSessionId`

#### Scenario: Different owner cannot take over recovery

- **WHEN** a different actor with an active platform-owner role and valid elevation requests the operation's status or recovery
- **THEN** the scoped lookup is rejected without disclosure or provider mutation
- **AND** no journal attribution is changed

#### Scenario: Current recovery authority is mandatory

- **WHEN** the original actor's current session is expired or unelevated, or the actor is disabled or no longer a platform owner
- **THEN** status and recovery are rejected even if the original operation was authorized
- **AND** no provider mutation occurs

#### Scenario: New elevation cannot confirm an old preview

- **WHEN** the original actor uses a different elevated session to confirm an unconfirmed preview
- **THEN** confirmation is rejected because the preview remains bound to its original session
- **AND** recovery authorization cannot be used to confirm that preview

### Requirement: Trial expiry inputs SHALL be explicit and validated
Management SHALL accept 7, 14, or 30 elapsed-day extensions or a specific future expiry instant. Extensions SHALL start at the later of server now and the current effective trial expiry. A trimmed reason of 1–1000 characters SHALL be required. Admin grants SHALL accept only `essentials`, `business_control`, `small_business`, or `business_pro`; aliases and unknown plans SHALL be rejected.

#### Scenario: Extend an unexpired trial
- **WHEN** the owner extends a trial ending in five days by seven days
- **THEN** the resulting expiry is twelve elapsed days from server now, not seven

#### Scenario: Restore an expired trial
- **WHEN** the owner grants seven days after all trial sources expired
- **THEN** the new grant expires seven elapsed days from server now

#### Scenario: Preview in the admin timezone
- **WHEN** the owner chooses a duration or specific expiry
- **THEN** a server preview shows the source, plan and resulting expiry in the admin's timezone with offset before confirmation
- **AND** persisted expiry is the confirmed UTC instant at second precision
- **AND** timezone-ambiguous or nonexistent wall times require correction or an explicit offset

#### Scenario: Reject invalid or shortening input
- **WHEN** a request uses an unsupported duration, malformed/non-future instant, blank/oversized reason, unsupported plan, or expiry not later than an existing valid trial's effective expiry
- **THEN** validation or conflict is returned without mutation
- **AND** current trial access cannot be shortened through an extension

### Requirement: Suitable active Stripe trials SHALL be extended through Stripe
When the tenant has a suitable Stripe subscription still in `trialing` status, extension SHALL update that trial through Stripe with unchanged plan and no incidental billing action. Local Stripe trial dates SHALL only reflect confirmed Stripe results. Failure or an unsupported Stripe configuration SHALL NOT silently fall back to an application-only grant.

#### Scenario: Extend a live Stripe trial
- **WHEN** the owner confirms a valid extension and current Stripe state remains suitable
- **THEN** Stripe trial end is updated once, the returned state is reconciled locally, and the outcome identifies Stripe as the source
- **AND** items, prices, collection settings, cancellation settings and schedules are not changed

#### Scenario: Stripe rejects the extension
- **WHEN** Stripe rejects the requested expiry or the API fails definitively
- **THEN** no fabricated local expiry is written and no notification of success is sent
- **AND** the operation failure is audited separately from its required business reason

#### Scenario: Stripe outcome is uncertain
- **WHEN** the update times out or Stripe succeeds but local persistence fails
- **THEN** the operation is shown as pending reconciliation rather than falsely successful or safely failed
- **AND** retries recover the same absolute target expiry without extending a second time

#### Scenario: Stripe restrictions cannot be bypassed
- **WHEN** the requested expiry exceeds Stripe's supported horizon, or a schedule/cancellation/pending billing change makes the update unsafe
- **THEN** the action is blocked with a clear explanation and existing billing-management guidance
- **AND** no automatic subscription resumption, cancellation reversal, or local replacement grant occurs

### Requirement: Admin grants SHALL be separate temporary application entitlements
For eligible tenants without a suitable live Stripe trial, the owner SHALL explicitly grant temporary PaidSoon access with a selected public plan and expiry. A tenant SHALL have at most one current grant. Extending a current grant SHALL preserve its usage-window start. Grants SHALL NOT alter persisted Stripe billing tier, status, trial dates, subscription, price, charges or schedules.

#### Scenario: Grant after expiry without charging
- **WHEN** a debt-free tenant has an expired onboarding trial or canceled/paused expired Stripe trial and the owner grants Business Control access
- **THEN** the tenant receives bounded Business Control application access
- **AND** Stripe is not mutated, no subscription is created/restarted, and no charge is triggered
- **AND** the UI identifies “PaidSoon access only — Stripe billing unchanged”

#### Scenario: Extend or replace a current grant
- **WHEN** the owner extends the current grant or changes its selected plan with a later expiry
- **THEN** only that tenant's current grant is updated and its original usage-window start remains unchanged
- **AND** prior plan/expiry and new plan/expiry are recorded in the audit

### Requirement: Trial management SHALL NOT bypass paid or delinquent billing
Grant/extension SHALL be blocked for active paid subscriptions, `past_due`, `unpaid`, incomplete billing, unresolved subscription-billing debt, and unresolved/lost billing disputes. Inability to establish billing eligibility SHALL fail closed. Existing paid entitlements and past-due grace SHALL remain unchanged. Revocation of an existing application grant SHALL remain permitted because it cannot increase access.

#### Scenario: Paid account retains its plan
- **WHEN** the owner attempts to grant or extend trial access for an active paid subscriber
- **THEN** the action is blocked as having no meaningful effect
- **AND** paid plan, limits, billing dates and charges remain unchanged

#### Scenario: Billing resolution is required
- **WHEN** a tenant is delinquent or has an unresolved/lost dispute for PaidSoon subscription billing, including after cancellation
- **THEN** grants and extensions are blocked and the existing billing portal/support resolution workflow is linked
- **AND** existing grants do not replace billing restrictions or increase grace-period entitlements

#### Scenario: Debtor dispute is not subscription delinquency
- **WHEN** only one of the tenant's debtor invoices is disputed
- **THEN** that debtor dispute is not used as a reason to block tenant trial management

### Requirement: Grant revocation SHALL remove only the current admin grant
The owner SHALL be able to revoke an existing admin grant with a required reason. Revocation SHALL be immediate and SHALL NOT cancel paid access, shorten a Stripe trial, change subscription status, or remove any independent onboarding access. Missing or already-revoked grants SHALL be reported without creating another access change.

#### Scenario: Revoke sole access source
- **WHEN** the owner revokes the grant providing the tenant's only valid access
- **THEN** subscription-gated access stops immediately, without waiting for cleanup

#### Scenario: Independent access survives revocation
- **WHEN** a valid paid subscription or Stripe trial independently provides access and the owner revokes a retained grant
- **THEN** that independent access remains unchanged

### Requirement: Trial operations SHALL be idempotent and concurrency safe
Each confirmed mutation SHALL carry a stable operation identifier and expected state version. Repeating the same tenant-scoped operation with identical input SHALL return its existing outcome, not perform another extension or notification. Reusing its identifier with different input SHALL conflict. Concurrent stale submissions SHALL conflict rather than overwrite each other.

#### Scenario: Retry a successful operation
- **WHEN** the same confirmed extension is retried after a lost response
- **THEN** the original expiry/result is returned with no additional days, grant, audit success or email

#### Scenario: Stale preview or concurrent edit
- **WHEN** another admin operation or billing update changes eligibility, version, source or effective expiry after preview
- **THEN** the stale submission returns a conflict requiring refresh and reconfirmation
- **AND** only one competing mutation is applied

#### Scenario: Changed request with reused identifier
- **WHEN** an operation identifier is reused with a different tenant, action, reason, plan, expiry or notify setting
- **THEN** the server rejects it rather than applying the changed request

### Requirement: Trial confirmation SHALL respect customer billing uncertainty

Owner grant, revoke and Stripe extension SHALL conflict while a customer billing mutation remains reserved or uncertain. Customer reservation/version changes SHALL invalidate prior previews. Current verified lifecycle reconciliation SHALL remain possible, but SHALL NOT finalize an owner operation without operation-specific evidence and its current fence.

#### Scenario: Customer crash leaves owner action blocked

- **WHEN** customer creation/upgrade/downgrade dispatch is unresolved after a crash, even after lease expiry
- **THEN** no owner trial mutation or reservation starts until the customer outcome is safely finalized

#### Scenario: Customer flow invalidates earlier preview

- **WHEN** a customer reservation is acquired or released after owner preview
- **THEN** confirmation requires refreshed state and a new preview, even if final billing status is unchanged

#### Scenario: Delayed Checkout becomes real paid state

- **WHEN** a prior Checkout session completes during an unresolved owner Stripe extension
- **THEN** verified paid state is preserved without clearing the owner reservation from the customer's completed fence
- **AND** owner recovery revalidates binding and proves its result or supersession rather than overwriting paid state with stale trial fields

### Requirement: Trial changes SHALL have durable append-only audit history
Accepted trial operations SHALL record acting owner, target tenant, action, access source, previous/new expiry, previous/granted plan, reason, UTC timestamp, operation identifier, and Stripe subscription/result when applicable. Success SHALL not be reported without durable audit persistence. Attempt, result, recovery and notification events SHALL append history rather than overwrite it.

#### Scenario: Access and success audit commit together
- **WHEN** a grant or revocation succeeds
- **THEN** its state change and success audit are durable together
- **AND** the audit exposes both the required reason and previous/new values

#### Scenario: Audit storage unavailable
- **WHEN** the initial operation/audit cannot be persisted
- **THEN** no Stripe mutation or local grant occurs
- **AND** failure to persist a result after Stripe succeeds leaves the durable operation recoverable and does not report completed success

#### Scenario: Recovery audit preserves both session identities

- **WHEN** the original actor performs authorized recovery in a current elevated session
- **THEN** an appended `trial_recovery` audit event uses the current session as its `adminSessionId`
- **AND** its metadata records `originalSessionId` from the immutable operation and `recoveringSessionId` from the current session, even when they are equal
- **AND** the original operation session and earlier audit rows remain unchanged

### Requirement: Optional notifications SHALL be independent and safely retryable
Notifications SHALL default off and use the existing email infrastructure for the resolved billing contact. Selected notifications SHALL include the applicable plan, expiry, source and PaidSoon link. Notification failure SHALL NOT undo completed access changes, SHALL be reported separately, and SHALL allow owner-authorized delivery-only retry without repeating the access mutation.

#### Scenario: Notification remains off
- **WHEN** the owner changes access without opting into notification
- **THEN** no notification is queued or sent

#### Scenario: Accurate application-only message
- **WHEN** an admin-granted access notification is delivered
- **THEN** it describes temporary application access and expiry, states Stripe billing is unchanged, and does not claim a charge was postponed
- **AND** it contains no internal reason or audit-only details

#### Scenario: Failed email is retried safely
- **WHEN** access changed successfully but email fails or its outcome is uncertain
- **THEN** the access outcome remains successful with a distinct delivery status
- **AND** safe retry uses the same delivery identity, cannot duplicate known successful delivery, and never changes expiry

#### Scenario: Billing contact unavailable
- **WHEN** notification is selected but no valid billing contact can be resolved
- **THEN** access may succeed while the notification is reported as blocked
- **AND** no debtor email or custom reminder sender address is used as a substitute
