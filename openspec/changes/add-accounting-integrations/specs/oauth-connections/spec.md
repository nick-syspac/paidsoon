## ADDED Requirements

### Requirement: OAuth state nonce prevents CSRF on callback
The system SHALL generate a cryptographically random state nonce for each OAuth authorisation
initiation, store it in the `oauth_states` table with a 10-minute TTL, and verify it on
the callback before proceeding with token exchange. The nonce SHALL be deleted after
successful verification (consume-once).

#### Scenario: State nonce is consumed on valid callback
- **WHEN** the OAuth callback is received with a `state` parameter matching an unexpired row in `oauth_states`
- **THEN** the system deletes the `oauth_states` row and proceeds with the token exchange

#### Scenario: State nonce is expired
- **WHEN** the OAuth callback is received with a `state` parameter matching a row in `oauth_states` that is older than 10 minutes
- **THEN** the system rejects the callback with HTTP 400, does not exchange the code, and instructs the user to try connecting again

#### Scenario: State nonce is absent or unrecognised
- **WHEN** the OAuth callback is received with a `state` parameter that does not match any row in `oauth_states`
- **THEN** the system rejects the callback with HTTP 400 and logs the event

#### Scenario: Stale oauth_states rows are purged
- **WHEN** the daily sync cron runs
- **THEN** the system deletes all `oauth_states` rows older than 1 hour as part of housekeeping

### Requirement: OAuth tokens are stored encrypted at rest
The system SHALL encrypt the OAuth access token and refresh token using AES-256-GCM with the
`TOKEN_ENCRYPTION_KEY` environment variable before writing them to the `accounting_connections`
table. Tokens SHALL only be decrypted in memory at the point of use, inside the provider
implementation, and SHALL NEVER be logged or returned in API responses.

#### Scenario: New connection tokens are stored
- **WHEN** the system completes a successful OAuth token exchange for any provider
- **THEN** the encrypted access token and encrypted refresh token are written to `accounting_connections`; the plaintext tokens are not persisted anywhere

#### Scenario: Token is used to make a provider API call
- **WHEN** the sync orchestrator initiates a provider API call
- **THEN** it decrypts the access token in memory, uses it for the API call, and does not assign the plaintext to any variable with a lifetime beyond the request

#### Scenario: Plaintext tokens are never returned in API responses
- **WHEN** any route handler or server component reads connection data
- **THEN** it SHALL NOT include `accessToken` or `refreshToken` fields in the response body

### Requirement: Access tokens are refreshed transparently before expiry
The system SHALL check whether the access token will expire within 5 minutes before making a
provider API call. If so, it SHALL use the refresh token to obtain a new access token, update
the `accounting_connections` row atomically, and proceed with the refreshed token. If the
refresh fails due to revoked consent, the connection SHALL be marked `status = 'revoked'`.

#### Scenario: Token is valid and not near expiry
- **WHEN** the sync orchestrator checks the token expiry for a connection
- **THEN** it proceeds with the existing access token without calling the refresh endpoint

#### Scenario: Token will expire within 5 minutes
- **WHEN** the sync orchestrator checks the token expiry and finds `tokenExpiresAt <= now() + 5 minutes`
- **THEN** it calls the provider refresh endpoint, stores the new encrypted access token and updated expiry, and proceeds with the refreshed token

#### Scenario: Refresh token has been revoked
- **WHEN** the provider refresh endpoint returns a 401 or `invalid_grant` error
- **THEN** the system marks the connection `status = 'revoked'`, logs the event, and skips the sync for that connection; a banner is shown to the user in the dashboard

### Requirement: System handles provider token revocation gracefully
The system SHALL detect when a provider has invalidated a connection (e.g., user revoked
access from Xero's connected apps screen) and SHALL surface this to the PaidSoon user with
clear messaging and a path to reconnect. It SHALL NEVER silently fail or continue sending
reminders under a revoked connection assumption.

#### Scenario: Provider returns 401 during a routine sync
- **WHEN** a provider API call returns HTTP 401 during a sync run
- **THEN** the system attempts one token refresh; if the refresh also fails, it marks the connection as `status = 'revoked'`, writes a `accounting_sync_runs` error record, and stops processing that connection

#### Scenario: User sees revoked connection banner
- **WHEN** the user logs in and has one or more connections with `status = 'revoked'`
- **THEN** the dashboard shows a prominent warning for each revoked connection with the provider name and a "Reconnect" button

### Requirement: OAuth scopes use least-privilege principle
The system SHALL request only the minimum OAuth scopes required for read-only invoice,
contact, and payment data from each provider. No write scopes SHALL be requested.

#### Scenario: Xero authorisation URL is constructed
- **WHEN** the system builds the Xero authorisation redirect URL
- **THEN** the `scope` parameter includes `accounting.transactions.read`, `accounting.contacts.read`, `openid`, `profile`, `email`, and `offline_access` — and does NOT include any write or admin scopes

#### Scenario: MYOB authorisation URL is constructed
- **WHEN** the system builds the MYOB authorisation redirect URL
- **THEN** the `scope` parameter includes only the granular read scopes for invoices, contacts, and payments as confirmed in OQ-1 (open question in design.md) — the deprecated `CompanyFile` scope SHALL NOT be requested

## Out of Scope

- OAuth PKCE code challenge (implementation detail; PKCE support per provider to be
  confirmed during implementation — TODO)
- Refresh token rotation (some providers issue new refresh tokens on each refresh; the
  system SHALL store the latest refresh token returned by each refresh response)
- OAuth token sharing across PaidSoon user accounts
