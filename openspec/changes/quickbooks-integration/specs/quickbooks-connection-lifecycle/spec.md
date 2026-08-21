# QuickBooks Connection Lifecycle Spec

## Purpose

Define how PaidSoon authorises, stores, refreshes, revokes, and surfaces QuickBooks Online connections so users can manage the provider safely through the same accounting integration experience used for existing providers.

## ADDED Requirements

### Requirement: User can initiate a QuickBooks Online connection

The system SHALL allow an authenticated user on an accounting-integration-eligible plan to initiate a QuickBooks Online OAuth 2.0 authorisation flow from the Connections settings experience. The flow SHALL create a short-lived state nonce before redirecting the user to QuickBooks.

#### Scenario: Eligible user starts the QuickBooks flow

- **WHEN** an authenticated eligible user requests a QuickBooks connection from the Connections page
- **THEN** the system stores a short-lived OAuth state nonce bound to that user and returns or redirects to a QuickBooks authorisation URL that includes the configured redirect URI and state value

#### Scenario: Ineligible user attempts to start the QuickBooks flow

- **WHEN** a Starter-tier user requests a QuickBooks connection
- **THEN** the system does not initiate OAuth and instead returns the existing accounting-integrations upgrade path

### Requirement: OAuth callback creates or refreshes a shared accounting connection

The system SHALL complete the QuickBooks callback by validating the state nonce, exchanging the authorisation code for tokens, and creating or updating a shared accounting connection record for the authenticated user and QuickBooks company.

#### Scenario: Callback succeeds for a first-time QuickBooks company

- **WHEN** QuickBooks redirects back with a valid code, matching state, and company identifier
- **THEN** the system exchanges the code for tokens, encrypts the tokens at rest, creates an active QuickBooks accounting connection for that company, and records the provider-scoped company identifier needed for future syncs

#### Scenario: Callback succeeds for an already connected QuickBooks company

- **WHEN** QuickBooks redirects back for a company that already has a connection owned by the same user
- **THEN** the system updates the existing connection tokens and status instead of creating a duplicate connection

#### Scenario: Callback contains an invalid or expired state nonce

- **WHEN** the callback state value is missing, unknown, or expired
- **THEN** the system rejects the callback, stores no tokens, and returns a recoverable error to the user

### Requirement: Connection credentials remain protected through their lifecycle

The system SHALL encrypt QuickBooks access and refresh tokens before persistence, SHALL refresh them before expiry when needed, and SHALL never return raw token values in client responses, logs, or audit trails.

#### Scenario: Token refresh is required during sync or disconnect

- **WHEN** the system needs a fresh QuickBooks access token to perform an authenticated operation
- **THEN** it refreshes the token set, persists the replacement encrypted values, and continues without exposing plaintext credentials outside process memory

#### Scenario: Token exchange or refresh fails due to revoked consent

- **WHEN** QuickBooks rejects a token exchange or refresh because the user revoked consent or the connection is no longer valid
- **THEN** the system marks the connection as revoked or errored, stops background use of that connection, and surfaces a reconnect action to the user

### Requirement: User can revoke a QuickBooks connection from PaidSoon

The system SHALL allow the owning user to disconnect a QuickBooks connection from the Connections page. Disconnect SHALL revoke the remote authorisation on a best-effort basis and SHALL disable further sync activity for that connection.

#### Scenario: User disconnects an active QuickBooks connection

- **WHEN** the owning user requests disconnect for an active QuickBooks connection
- **THEN** the system attempts provider-side revocation, marks the local connection as disconnected, and prevents further automated syncs for that connection

#### Scenario: Provider-side revocation fails during disconnect

- **WHEN** QuickBooks revocation fails or times out
- **THEN** the system still marks the local connection as disconnected and records the revocation failure for operator visibility

### Requirement: QuickBooks connection health is visible in user and admin surfaces

The system SHALL expose QuickBooks connection status, last successful sync time, and latest failure state in the same user-facing and admin-facing connection views that already surface other accounting providers.

#### Scenario: User opens the Connections page with a QuickBooks connection

- **WHEN** the user views their provider connections
- **THEN** the QuickBooks entry shows provider name, company name, current status, and the latest sync timestamp or recovery state

#### Scenario: Admin inspects a tenant with QuickBooks enabled

- **WHEN** an administrator views tenant connection details or diagnostics
- **THEN** the tenant snapshot includes the QuickBooks connection state without exposing encrypted token fields
