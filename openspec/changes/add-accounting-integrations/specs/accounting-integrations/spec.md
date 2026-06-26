## ADDED Requirements

### Requirement: User can connect a Xero organisation
The system SHALL allow an authenticated user with a Solo or Small Business subscription to
initiate an OAuth 2.0 authorisation flow to connect their Xero account. The flow SHALL use
PKCE and a short-lived state nonce to prevent CSRF. After successful authorisation, the user
SHALL be prompted to select one organisation (tenant) from their Xero account if multiple
are available.

#### Scenario: Xero connect button clicked
- **WHEN** a user on the Solo or Small Business tier clicks "Connect Xero" in the integrations settings
- **THEN** the system generates a state nonce, stores it in `oauth_states` with a 10-minute TTL, and redirects the user to the Xero authorisation URL with `response_type=code`, `scope`, `state`, and `redirect_uri`

#### Scenario: Xero OAuth callback with single organisation
- **WHEN** Xero redirects back to `/api/integrations/xero/callback` with a valid `code` and matching `state`
- **THEN** the system exchanges the code for access and refresh tokens, fetches the user's Xero connections, and creates an `accounting_connections` row for the single organisation with tokens encrypted at rest

#### Scenario: Xero OAuth callback with multiple organisations
- **WHEN** Xero redirects back and the user has multiple organisations on their Xero account
- **THEN** the system stores the pending tokens and redirects the user to an organisation-selection UI before finalising the connection

#### Scenario: Xero callback with invalid or expired state
- **WHEN** the OAuth callback is received with a `state` value that does not match any row in `oauth_states` or whose TTL has expired
- **THEN** the system rejects the request with an error, does NOT store any tokens, and displays a clear error message to the user

#### Scenario: Starter user attempts to connect Xero
- **WHEN** a user on the Starter tier clicks "Connect Xero"
- **THEN** the system displays an upgrade prompt and does NOT initiate the OAuth flow

### Requirement: User can connect a MYOB Business company file
The system SHALL allow an authenticated user with a Solo or Small Business subscription to
connect a MYOB Business company file via OAuth 2.0. The integration SHALL use MYOB's current
granular OAuth scopes (not the deprecated `CompanyFile` scope). After authorisation, if the
user has multiple company files, they SHALL be prompted to select one.

#### Scenario: MYOB connect button clicked
- **WHEN** a user on the Solo or Small Business tier clicks "Connect MYOB" in integrations settings
- **THEN** the system generates a state nonce, stores it in `oauth_states`, and redirects the user to the MYOB authorisation URL with required scopes

#### Scenario: MYOB OAuth callback received
- **WHEN** MYOB redirects back to `/api/integrations/myob/callback` with a valid `code` and matching `state`
- **THEN** the system exchanges the code for access and refresh tokens, fetches available company files, and either creates a connection immediately (single file) or prompts for selection (multiple files)

#### Scenario: User selects MYOB company file
- **WHEN** the user selects a company file from the MYOB selection screen
- **THEN** the system creates an `accounting_connections` row scoped to that company file with encrypted tokens and immediately triggers a first sync

### Requirement: User can disconnect an accounting provider connection
The system SHALL allow an authenticated user to disconnect any active accounting provider
connection. On disconnect, the system SHALL revoke the OAuth token at the provider (best-
effort) and mark the `accounting_connections` row as `status = 'disconnected'`. Active
`TrackedInvoice` records sourced from that connection SHALL be moved to `status = 'paused'`
to avoid orphaned reminder sequences.

#### Scenario: User disconnects a Xero organisation
- **WHEN** a user clicks "Disconnect" on a connected Xero organisation
- **THEN** the system attempts to revoke the access token at Xero's revocation endpoint, marks the connection as disconnected, and transitions any active tracked invoices for that connection to paused status

#### Scenario: Xero revocation request fails
- **WHEN** the Xero token revocation API call returns an error
- **THEN** the system still marks the connection as disconnected locally and logs the revocation failure; the user sees a success message (local disconnect succeeded)

#### Scenario: User disconnects MYOB company file
- **WHEN** a user clicks "Disconnect" on a connected MYOB company file
- **THEN** the system follows the same disconnect lifecycle as Xero: revoke (best-effort), mark disconnected, pause tracked invoices

### Requirement: System supports multiple accounting connections per user
The system SHALL allow a user to have multiple active accounting connections simultaneously —
including multiple Xero organisations, multiple MYOB company files, and connections to both
providers at the same time — subject to plan limits.

#### Scenario: User connects a second Xero organisation
- **WHEN** a user with one active Xero connection initiates a new Xero connect flow
- **THEN** the system creates a second `accounting_connections` row for the new organisation and syncs invoices from it independently

#### Scenario: User has both Xero and MYOB connected
- **WHEN** a user has one active Xero connection and one active MYOB connection
- **THEN** the daily sync job processes both connections independently and merges invoices into the user's `TrackedInvoice` pool, deduplicated by `externalId + provider + userId`

### Requirement: System surfaces connection status and sync health to user
The system SHALL display the current status of each accounting connection (active, revoked,
error) and the date/time of the last successful sync in the integrations settings UI.

#### Scenario: User views integrations settings with active connection
- **WHEN** a user navigates to the integrations settings page with an active connection
- **THEN** the system shows the provider name, organisation/company name, connection status, last synced timestamp, and the number of invoices synced in the last run

#### Scenario: Connection is in revoked state
- **WHEN** a user views integrations settings and one connection has `status = 'revoked'`
- **THEN** the system displays a warning banner with a "Reconnect" call-to-action

## Out of Scope

- Invoice creation or modification in Xero or MYOB
- Payment recording or reconciliation in Xero or MYOB
- Xero or MYOB webhook event subscriptions (future enhancement)
- Sharing a single accounting connection across multiple PaidSoon user accounts
- MYOB AccountRight desktop (on-premise) API
- Bulk import of historical invoices older than 12 months (configurable, future)
