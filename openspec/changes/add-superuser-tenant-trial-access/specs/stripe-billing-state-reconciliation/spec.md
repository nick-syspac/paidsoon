# Spec Delta

## MODIFIED Requirements

### Requirement: Billing webhook SHALL handle required Stripe lifecycle events idempotently
The system SHALL idempotently reconcile checkout completion, subscription create/update/delete, invoice paid/payment-failed, trial-will-end, and subscription-billing dispute lifecycle events. Completed events SHALL deduplicate; interrupted/failed events SHALL remain retryable. Reconciliation SHALL coordinate with tenant trial and customer billing mutations and use current authoritative Stripe state when payload order cannot safely determine the result.

#### Scenario: Duplicate event delivery is a safe no-op
- **WHEN** Stripe retries delivery for an already-processed event
- **THEN** the endpoint returns success with no duplicate state mutation or trial-operation result

#### Scenario: Out-of-order older event does not overwrite newer state
- **WHEN** an older subscription event arrives after a newer event for the same subscription
- **THEN** it cannot overwrite newer status, tier, period dates or trial end
- **AND** equal timestamps are not assumed to establish reliable ordering

#### Scenario: Failed processing can retry
- **WHEN** an event was recorded but reconciliation did not commit successfully
- **THEN** redelivery retries processing rather than treating mere receipt as success
- **AND** failure returns a retryable response

#### Scenario: Delayed payload cannot undo a direct extension
- **WHEN** a pre-extension or same-second payload arrives after a confirmed owner extension
- **THEN** reconciliation retrieves current Stripe state and cannot restore the obsolete trial expiry
- **AND** a genuinely newer paid, delinquent or canceled state is not hidden by a local maximum-expiry rule

### Requirement: Stripe lifecycle fields SHALL be persisted from Stripe timestamps
Reconciliation SHALL persist customer/subscription identity, status, trial end, period dates, price, cancellation state and plan mapping from verified Stripe state. Direct admin/customer results and lifecycle reconciliation SHALL share that contract. Stripe events SHALL NOT rewrite admin grants. Subscription deletion SHALL remove subscription-derived access while preserving eligible independent access.

#### Scenario: Subscription create/update persists lifecycle fields
- **WHEN** subscription create/update events are reconciled
- **THEN** Unix-second timestamps are converted safely
- **AND** stored fields reflect current verified Stripe state instead of an obsolete delivered snapshot

#### Scenario: Subscription delete revokes access state
- **WHEN** deletion of the tenant's current Stripe subscription is confirmed
- **THEN** persisted status reflects cancellation and removes subscription-derived access
- **AND** cancellation flags reconcile consistently without revoking or applying base-plan side effects to an eligible independent grant

#### Scenario: Old subscription does not replace current subscription
- **WHEN** an event identifies another tenant's customer or a superseded subscription
- **THEN** conflicting identifiers are rejected or safely ignored and cannot rebind the current subscription

## ADDED Requirements

### Requirement: Billing authority SHALL be writable only by verified server workflows
Customers SHALL NOT directly insert billing profiles or update billing, trial, reservation or entitlement-version columns through the authenticated database role. Authenticated billing endpoints SHALL retain tenant-scoped ownership reads and persist verified billing results through the coordinating server-only service. Profile-name edits SHALL remain available without resetting an existing trial; missing profiles SHALL use the existing idempotent bootstrap.

#### Scenario: Profile name update preserves trial authority
- **WHEN** an authenticated tenant edits its display name
- **THEN** only that tenant's display name and lifecycle update timestamp change
- **AND** existing trial dates, billing state and entitlement version remain unchanged

#### Scenario: Missing profile uses existing bootstrap
- **WHEN** an authenticated tenant without a profile saves its display name
- **THEN** the existing idempotent profile bootstrap runs and the name is saved through tenant-scoped RLS
- **AND** the customer database role cannot insert arbitrary billing/trial state

#### Scenario: Checkout works with restricted billing columns
- **WHEN** an authenticated tenant creates Checkout, upgrades, or returns from verified Checkout completion
- **THEN** customer/subscription binding and confirmed billing state are persisted through the scoped coordinating server service
- **AND** customer column privileges remain restricted and another tenant's provider records cannot be bound

#### Scenario: Onboarding completion does not require billing privileges

- **WHEN** an authenticated tenant completes onboarding with a valid public plan selection
- **THEN** the tenant-scoped completion write changes only onboarding completion and its lifecycle timestamp
- **AND** no subscription tier/status/date, provider binding, reservation or entitlement-version write is attempted or privileged billing exception introduced

### Requirement: Billing risk SHALL remain distinct from debtor invoice disputes
Grant eligibility SHALL reconcile PaidSoon subscription-billing debt and dispute facts separately from invoice-chasing disputes. Confirmed delinquency, unresolved or lost subscription-charge disputes SHALL suppress grant-derived access until resolved through the existing billing workflow. A paid invoice or canceled subscription SHALL NOT clear an unrelated dispute/debt fact.

#### Scenario: Dispute arrives while a grant is active
- **WHEN** a verified billing dispute becomes unresolved for a charge tied to the tenant's PaidSoon subscription
- **THEN** the grant no longer supplies access and billing-resolution guidance is exposed
- **AND** no debtor invoice is marked disputed by that event

#### Scenario: Independent risk facts survive unrelated events
- **WHEN** an unrelated invoice is paid or the subscription is canceled while a billing debt/dispute remains unresolved
- **THEN** the outstanding risk remains and the grant cannot reactivate

#### Scenario: Verified resolution restores eligible grant
- **WHEN** Stripe confirms that all blocking billing facts are resolved and the grant remains unrevoked and unexpired
- **THEN** grant access becomes eligible again without a new trial mutation or incidental charge

### Requirement: Customer billing mutations SHALL be durably accepted before provider calls

Customer billing workflows SHALL use a durable journal distinct from owner trial operations. Accepted operations SHALL record authenticated tenant/actor, immutable normalized intent/hash, frozen provider steps/keys and recoverable state before external mutation. Customers SHALL NOT be represented by fabricated admin sessions. Journal states SHALL be `pending`, `reconciliation_required`, `succeeded`, `failed` or `superseded`.

#### Scenario: Persistence fails before dispatch

- **WHEN** the customer mutation or reservation cannot be durably recorded
- **THEN** no customer, session, subscription or schedule mutation is sent to Stripe
- **AND** the endpoint reports unavailable persistence rather than accepted success

#### Scenario: Crash after provider success

- **WHEN** customer/session creation or a billing update succeeds but the process crashes before its result commits
- **THEN** the accepted intent, key and reservation survive for recovery
- **AND** another request cannot start an unkeyed replacement or an owner trial operation

### Requirement: Customer mutation identity SHALL prevent changed or duplicate intent

Customer billing mutation routes SHALL require a stable UUID operation key and expected billing-access version. Identical retries SHALL recover/replay the stored operation before checking current version. Changed tenant, actor, action or normalized intent under that key SHALL conflict. Provider requests SHALL retain their frozen parameters and distinct per-step keys, independent of later configuration changes.

#### Scenario: Lost response is retried

- **WHEN** a customer retries a completed Checkout creation with the same UUID and intent
- **THEN** the original safe response/session is returned without another create
- **AND** a version increment from that operation does not prevent its identical replay

#### Scenario: Changed intent or missing safety envelope

- **WHEN** a caller changes the requested plan under an existing UUID or omits a valid operation/version header
- **THEN** changed intent returns 409 and malformed/missing safety headers return 400 before provider mutation

#### Scenario: Configuration changes during recovery

- **WHEN** prices, trial configuration or redirect configuration change after the first attempt
- **THEN** recovery uses the original frozen provider request/key, not regenerated parameters

### Requirement: Customer and owner reservations SHALL be mutually exclusive

All customer and owner billing-access mutations SHALL coordinate through the same tenant reservation/version boundary. At most one unresolved customer or owner mutation SHALL reserve a tenant. Lease expiry SHALL NOT release uncertainty. Stale executors SHALL NOT advance steps, project billing values or clear reservations. Reservation changes SHALL invalidate existing trial previews.

#### Scenario: Unknown customer outcome blocks owner management

- **WHEN** a customer create/update is unresolved or a multi-step workflow partially completed
- **THEN** owner extension/grant/revoke and another customer mutation conflict
- **AND** lease expiry alone does not permit them to proceed

#### Scenario: Owner operation blocks customer mutation

- **WHEN** an unresolved owner Stripe operation reserves the tenant
- **THEN** customer creation, upgrade, downgrade, local cancellation and portal-session creation cannot dispatch

#### Scenario: Stale fence cannot finalize

- **WHEN** a recovered operation has a new execution fence and an old executor returns
- **THEN** the old executor cannot finalize, start a later step or release the reservation

#### Scenario: Reservation changes after preview

- **WHEN** a customer mutation acquires and releases a reservation after an owner preview even without changing final billing state
- **THEN** owner confirmation conflicts and requires a fresh preview

### Requirement: Multi-step billing workflows SHALL preserve partial outcomes

Customer creation/binding prerequisites and downgrade schedule create/update SHALL retain individually keyed, immutable step results under recoverable reservations. Later steps SHALL execute only after prior results are verified and the next request is frozen. A partial rejection SHALL NOT be reported safely failed while an earlier provider effect remains unresolved, and SHALL NOT trigger unapproved compensation.

#### Scenario: Crash between schedule creation and phase update

- **WHEN** Stripe creates a downgrade schedule and the process stops before its phases are updated
- **THEN** recovery retrieves the same schedule and resumes only its frozen next step when safe
- **AND** no duplicate schedule or automatic release is created

#### Scenario: Customer prerequisite succeeds

- **WHEN** a customer is created and verified for Checkout or portal
- **THEN** binding and reservation handoff to the originating workflow are coordinated atomically
- **AND** a lost response resumes the same prerequisite rather than creating another customer

#### Scenario: Phase update is definitively rejected after create

- **WHEN** schedule creation succeeded but the requested phase update is rejected
- **THEN** the workflow remains reserved for reconciliation until intended state or separately reviewed safe closure is proven
- **AND** the system does not silently release the schedule or return an unqualified safe failure

### Requirement: Recovery SHALL respect provider evidence and key retention

Recovery SHALL verify current provider objects and binding before projection. Identical request/key replay SHALL occur only strictly within 24 hours of that step's durable first attempt. At or beyond that boundary, recovery SHALL use retrieval and attributable evidence only. Unknown creates SHALL remain blocked without blind recreation; lack of evidence SHALL NOT imply safe nonexecution or supersession.

#### Scenario: Replay inside retained-key window

- **WHEN** an uncertain step is explicitly reconciled before its 24-hour deadline
- **THEN** retrieval or exact request/key replay can recover its result without changing intent
- **AND** cached provider failures remain uncertain unless nonexecution is proven

#### Scenario: Unknowable creation outside retention

- **WHEN** customer, Checkout, schedule or portal-session creation remains unknowable at or beyond 24 hours
- **THEN** the reservation remains reconciliation-required for provider/operator investigation
- **AND** no new key or blind create is sent, even if a non-exhaustive list contains no match

#### Scenario: Newer state supersedes known result

- **WHEN** operation-specific evidence proves an outcome and a genuinely newer verified binding/state makes its projection obsolete
- **THEN** the fenced workflow can finish as superseded without overwriting current state
- **AND** an unknown outcome cannot be relabeled superseded just to release its reservation

### Requirement: Customer operation recovery SHALL be authenticated and safely projected

Customers SHALL be able to read status and explicitly reconcile only their own customer operations, even without subscription access. Recovery SHALL enforce same-origin and accept only stored intent, not arbitrary provider parameters. Responses SHALL expose safe operation state, never raw requests, keys, provider internals or other tenant identities. Missing/foreign operations SHALL return indistinguishable 404 responses.

#### Scenario: Accepted uncertain operation returns 202

- **WHEN** an authenticated billing mutation times out or its provider result cannot yet be persisted
- **THEN** it returns 202 with operation ID, safe state and scoped status/reconciliation guidance
- **AND** successful known operations retain existing success result shapes

#### Scenario: Customer explicitly recovers its operation

- **WHEN** the tenant requests its authenticated status endpoint or same-origin reconcile endpoint with an empty object body
- **THEN** only the stored own operation and its prerequisite can be read/recovered
- **AND** recovery makes one bounded attempt, with no automatic mutation retry loop

#### Scenario: Recovery cannot bypass authority

- **WHEN** a caller supplies another tenant's UUID, an owner-operation UUID, replacement provider IDs/parameters, or a cross-origin mutation
- **THEN** it is rejected without provider calls or disclosure
- **AND** no fabricated administrator authority or generic billing patch is available

### Requirement: Both billing journals SHALL remain server-only

Customer/anonymous database roles SHALL have no direct journal read/write authority and no billing reservation/version-column write authority. Customer ownership/access reads SHALL retain tenant RLS. Server-only mutation/status services SHALL authenticate and scope customer operations before privileged journal access, and persist only verified provider billing projections.

#### Scenario: Direct Data API access is denied

- **WHEN** a customer or anonymous role tries to select/modify either journal or write either reservation/billing-version column
- **THEN** database privileges and RLS deny access
- **AND** legitimate own profile-name and safe access reads remain available

### Requirement: Hosted session creation SHALL finish independently of subscription lifecycle

Verified Checkout/general portal/cancellation portal session creation SHALL complete its operation and release its reservation without waiting for the hosted flow. Its success SHALL NOT claim payment, cancellation or subscription completion. Later lifecycle observations SHALL be reconciled independently without rewriting the immutable creation result or holding a tenant lock for the hosted lifetime.

#### Scenario: Open Checkout session does not reserve tenant indefinitely

- **WHEN** Stripe verifies creation of a still-open Checkout session
- **THEN** creation succeeds and its reservation is released
- **AND** identical retries return the same session while later completion remains independently reconcilable

#### Scenario: Existing cancellation behavior remains portal-backed

- **WHEN** a customer with a linked subscription starts cancellation
- **THEN** the system creates the existing cancellation portal flow, not a new direct cancellation API action
- **AND** actual cancellation is recognized only from verified provider lifecycle state

#### Scenario: Successful onboarding lands with plan intent only

- **WHEN** a tenant successfully completes onboarding selecting a public plan
- **THEN** navigation reaches the existing `/billing/checkout?plan=<selectedPlan>` landing displaying that intended plan
- **AND** completion, landing render or refresh creates no customer, Checkout session or subscription and sends no automatic Checkout POST

#### Scenario: Explicit Checkout button retains existing billing safety

- **WHEN** the tenant explicitly activates the existing Checkout button after arriving from onboarding
- **THEN** the existing UUID/version-protected customer billing workflow receives the intended tier and retains its existing pricing, trial, upgrade, reconciliation and 202 recovery rules
- **AND** selection itself remains non-authoritative until a verified billing change, with independent grants preserved

#### Scenario: Failed onboarding or canceled Checkout cannot auto-start billing

- **WHEN** onboarding completion fails or the tenant returns from canceled Checkout
- **THEN** failure stays on the picker with safe feedback, or the Checkout landing remains a stable explicit-action stop, respectively
- **AND** no automatic Checkout POST, replacement session or mutation retry loop starts

### Requirement: Delayed Checkout completion SHALL protect current binding and reservations

Authenticated Checkout success and signed lifecycle events SHALL verify completed session, subscription, customer and tenant correlation before projecting true current state. They SHALL protect newer bindings and independent grants/risk. Completion of an older customer operation SHALL NOT clear an unresolved owner/customer reservation without that reserved operation's own evidence and current fence.

#### Scenario: Trial Checkout requires no immediate payment

- **WHEN** a verified completed subscription-mode session has a legitimate trial/no-payment-required outcome
- **THEN** current Stripe trial state is reconciled without fabricating paid status or denying completion solely for lack of immediate payment

#### Scenario: Completion arrives during owner extension

- **WHEN** an earlier created Checkout session completes while an owner trial operation is unresolved
- **THEN** real current paid/trial state can be reconciled and billing version advances
- **AND** the owner reservation remains until its correctly fenced result/recovery proves completion or supersession
- **AND** the completed customer operation cannot write the owner's frozen trial target

#### Scenario: Old session cannot rebind over new subscription

- **WHEN** delayed completion references a different subscription from a verified newer current binding or ambiguous multiple live subscriptions
- **THEN** it is treated as obsolete or requiring reconciliation rather than replacing the current subscription from metadata alone

#### Scenario: Legacy completion remains safely supported

- **WHEN** a pre-deployment session has no customer-journal operation metadata
- **THEN** existing authenticated/signed tenant and customer mapping must still be verified
- **AND** no operation identity/fence is fabricated and no unresolved reservation is cleared merely from that completion

#### Scenario: Unrelated webhook is not operation proof

- **WHEN** a signed event confirms current state but does not prove the reserved operation's outcome
- **THEN** true lifecycle/risk state can update while that reservation remains unresolved
- **AND** receipt, event timestamp, matching status or lease expiry alone cannot release it
