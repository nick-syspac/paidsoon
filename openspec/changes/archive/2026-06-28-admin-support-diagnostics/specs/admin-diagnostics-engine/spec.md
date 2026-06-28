## ADDED Requirements

### Requirement: Diagnostic checks run on every tenant detail page load
The system SHALL evaluate all registered diagnostic checks on every render of `/admin/tenants/[userId]`. Checks SHALL receive a `TenantSnapshot` object (a plain data structure assembled from a single aggregated DB fetch) and return either a `Diagnostic` object or `null`. No check SHALL make its own database or external API call.

#### Scenario: Healthy tenant shows no issues
- **WHEN** an admin views a tenant detail page for a user with no detected problems
- **THEN** a "No issues detected" message is shown and no diagnostic cards are rendered

#### Scenario: Unhealthy tenant shows relevant issue cards
- **WHEN** an admin views a tenant detail page for a user with one or more detected problems
- **THEN** each problem is rendered as a card showing severity, title, description, and available actions

#### Scenario: Error-severity issues appear before warning-severity issues
- **WHEN** a tenant has both error and warning diagnostics
- **THEN** error cards are rendered before warning cards in the issues section

---

### Requirement: Custom From address with unverified domain is flagged as an error
The diagnostics engine SHALL flag a tenant as having a `custom-from-unverified` error when `EmailSettings.fromEmail` is non-null AND `EmailSettings.resendVerified` is `false`.

#### Scenario: Custom From set, domain not verified
- **WHEN** a tenant has `emailSettings.fromEmail` set to a non-null value and `emailSettings.resendVerified` is `false`
- **THEN** a `custom-from-unverified` error diagnostic is returned

#### Scenario: Custom From set, domain verified
- **WHEN** a tenant has `emailSettings.fromEmail` set and `emailSettings.resendVerified` is `true`
- **THEN** no `custom-from-unverified` diagnostic is returned

#### Scenario: No custom From set
- **WHEN** a tenant has no `EmailSettings` record or `fromEmail` is null
- **THEN** no `custom-from-unverified` diagnostic is returned

---

### Requirement: Expired trial with no active subscription is flagged as an error
The diagnostics engine SHALL flag a `trial-lapsed` error when `UserProfile.subscriptionStatus` is `"trialing"` AND `UserProfile.trialEndsAt` is in the past.

#### Scenario: Trial has lapsed
- **WHEN** a tenant has `subscriptionStatus = "trialing"` and `trialEndsAt` is before the current time
- **THEN** a `trial-lapsed` error diagnostic is returned

#### Scenario: Trial still active
- **WHEN** a tenant has `subscriptionStatus = "trialing"` and `trialEndsAt` is in the future
- **THEN** no `trial-lapsed` diagnostic is returned

#### Scenario: Paid subscription, no trial concern
- **WHEN** a tenant has `subscriptionStatus = "active"` (paid)
- **THEN** no `trial-lapsed` diagnostic is returned

---

### Requirement: Disconnected Stripe Connect account is flagged as a warning
The diagnostics engine SHALL flag a `stripe-connect-disconnected` warning when `UserProfile.stripeConnectAccountId` is null or empty.

#### Scenario: Stripe Connect not connected
- **WHEN** a tenant has no `stripeConnectAccountId`
- **THEN** a `stripe-connect-disconnected` warning diagnostic is returned

#### Scenario: Stripe Connect is connected
- **WHEN** a tenant has a non-null `stripeConnectAccountId`
- **THEN** no `stripe-connect-disconnected` diagnostic is returned

---

### Requirement: Stale or errored accounting connection is flagged as a warning
The diagnostics engine SHALL flag a `sync-stale` warning for each `AccountingConnection` where `status` is `"error"` or `"disconnected"`, OR where `lastSyncedAt` is more than 48 hours ago and `status` is `"active"`.

#### Scenario: Connection in error state
- **WHEN** a tenant has an `AccountingConnection` with `status = "error"`
- **THEN** a `sync-stale` warning diagnostic is returned for that connection

#### Scenario: Connection last synced more than 48 hours ago
- **WHEN** a tenant has an `AccountingConnection` with `status = "active"` and `lastSyncedAt` older than 48 hours
- **THEN** a `sync-stale` warning diagnostic is returned

#### Scenario: Connection recently synced
- **WHEN** a tenant has an `AccountingConnection` with `status = "active"` and `lastSyncedAt` within the last 48 hours
- **THEN** no `sync-stale` diagnostic is returned for that connection

---

### Requirement: No invoices tracked after 7-day grace period is flagged as info
The diagnostics engine SHALL flag a `no-invoices-tracked` info diagnostic when a tenant's account is older than 7 days AND they have zero `TrackedInvoice` records in any state.

#### Scenario: Account older than 7 days with no invoices
- **WHEN** a tenant's `UserProfile.createdAt` is more than 7 days ago and their total tracked invoice count is zero
- **THEN** a `no-invoices-tracked` info diagnostic is returned

#### Scenario: New account with no invoices
- **WHEN** a tenant's `UserProfile.createdAt` is within the last 7 days and they have no invoices
- **THEN** no `no-invoices-tracked` diagnostic is returned (grace period applies)

#### Scenario: Account with invoices
- **WHEN** a tenant has one or more tracked invoices in any state
- **THEN** no `no-invoices-tracked` diagnostic is returned
