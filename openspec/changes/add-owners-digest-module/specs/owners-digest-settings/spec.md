# owners-digest-settings

## Purpose

Define the Owner's Digest settings experience so authorised users can control whether the digest runs, when it is delivered, how much detail it includes, and which material issues are worth surfacing for their business.

## ADDED Requirements

### Requirement: Owner's Digest settings SHALL be tenant-scoped and authorisation-protected

The system SHALL store Owner's Digest settings for the tenant and SHALL allow only authorised users to view or update those settings.

#### Scenario: Authorised user updates Owner's Digest settings

- **WHEN** an authorised tenant user saves an Owner's Digest settings change
- **THEN** the system persists the change for that tenant's future digest generations

#### Scenario: Unauthorised user attempts to update settings

- **WHEN** a user without the required authority submits an Owner's Digest settings change
- **THEN** the system denies the request without modifying the tenant's settings

### Requirement: Owner's Digest settings SHALL support cadence and delivery controls

The system SHALL support digest frequencies of Off, Daily, Weekly, and Monthly, with weekly delivery as the default enabled cadence. It SHALL also support delivery-day, delivery-time, and timezone configuration where the selected cadence uses scheduled delivery.

#### Scenario: Tenant keeps default cadence

- **WHEN** a tenant has no saved Owner's Digest settings
- **THEN** the settings experience shows the default weekly cadence and default delivery window

#### Scenario: User selects a monthly digest cadence

- **WHEN** an authorised user changes the digest frequency to Monthly
- **THEN** the system stores the cadence and uses it for future scheduled generation and email delivery

### Requirement: Owner's Digest settings SHALL support section and materiality controls

The system SHALL allow authorised users to configure included digest sections, maximum surfaced action items, and minimum materiality thresholds within safe validation bounds.

#### Scenario: User reduces maximum action items

- **WHEN** an authorised user lowers the action-item limit
- **THEN** future digests cap the surfaced attention list to the configured maximum after ranking

#### Scenario: User submits out-of-range settings

- **WHEN** a settings request contains an unsupported cadence, invalid limit, or invalid materiality value
- **THEN** the system rejects the update with a validation error and does not persist a partial change

### Requirement: Owner's Digest settings SHALL constrain recipient selection to the tenant

The system SHALL allow digest recipients to be selected only from authorised users or recipient roles within the same tenant.

#### Scenario: Tenant selects owner-only recipients

- **WHEN** the tenant configures Owner's Digest delivery to the business owner only
- **THEN** the system limits scheduled sends to that allowed recipient scope

#### Scenario: Request includes an external recipient

- **WHEN** a settings update attempts to add a recipient outside the tenant's authorised user set
- **THEN** the system rejects the update and does not store the external recipient
