# Spec Delta

## MODIFIED Requirements

### Requirement: User can connect a Xero organisation

The system SHALL allow an authenticated user with a Solo or Small Business subscription to
initiate an OAuth 2.0 authorisation flow to connect their Xero account. The flow SHALL use
PKCE and a short-lived state nonce to prevent CSRF. After successful authorisation, the user
SHALL be prompted to select one organisation (tenant) from their Xero account if multiple
are available. When a Xero organisation is finalised as a connection, the system SHALL
immediately trigger the first sync for that connection.

#### Scenario: Xero connect button clicked

- **WHEN** a user on the Solo or Small Business tier clicks "Connect Xero" in the integrations settings
- **THEN** the system generates a state nonce, stores it in `oauth_states` with a 10-minute TTL, and redirects the user to the Xero authorisation URL with `response_type=code`, `scope`, `state`, and `redirect_uri`

#### Scenario: Xero OAuth callback with single organisation

- **WHEN** Xero redirects back to `/api/integrations/xero/callback` with a valid `code` and matching `state`, and the user has exactly one organisation
- **THEN** the system exchanges the code for access and refresh tokens, creates or updates the `accounting_connections` row for that organisation with encrypted tokens, and immediately triggers the first sync before returning the user to `/dashboard/settings/connections`

#### Scenario: Xero OAuth callback with multiple organisations

- **WHEN** Xero redirects back and the user has multiple organisations on their Xero account
- **THEN** the system stores the pending tokens and redirects the user to an organisation-selection UI before finalising the connection

#### Scenario: User selects a Xero organisation after multi-organisation authorisation

- **WHEN** the user confirms one organisation from the Xero organisation-selection UI
- **THEN** the system creates or updates the `accounting_connections` row for that organisation with encrypted tokens and immediately triggers the first sync

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
user has multiple company files, they SHALL be prompted to select one. When a MYOB company
file is finalised as a connection, the system SHALL immediately trigger the first sync for
that connection.

#### Scenario: MYOB connect button clicked

- **WHEN** a user on the Solo or Small Business tier clicks "Connect MYOB" in integrations settings
- **THEN** the system generates a state nonce, stores it in `oauth_states`, and redirects the user to the MYOB authorisation URL with required scopes

#### Scenario: MYOB OAuth callback received

- **WHEN** MYOB redirects back to `/api/integrations/myob/callback` with a valid `code` and matching `state`
- **THEN** the system exchanges the code for access and refresh tokens, fetches available company files, and either creates a connection immediately and triggers the first sync (single file) or prompts for selection (multiple files)

#### Scenario: User selects MYOB company file

- **WHEN** the user selects a company file from the MYOB selection screen
- **THEN** the system creates an `accounting_connections` row scoped to that company file with encrypted tokens and immediately triggers a first sync

### Requirement: System surfaces connection status and sync health to user

The system SHALL display the current status of each accounting connection, including whether
it is awaiting its first sync, active, revoked, or in error, together with the date/time of
the last successful sync in the integrations settings UI.

#### Scenario: User views integrations settings with active connection

- **WHEN** a user navigates to the integrations settings page with an active connection
- **THEN** the system shows the provider name, organisation/company name, connection status, last synced timestamp, and the number of invoices synced in the last run

#### Scenario: Connection is awaiting its first sync

- **WHEN** a user views integrations settings and one connection has been finalised but has not yet completed its first sync attempt
- **THEN** the system displays that connection as awaiting its first sync instead of presenting it as already fully synced

#### Scenario: Connection is in revoked state

- **WHEN** a user views integrations settings and one connection has `status = 'revoked'`
- **THEN** the system displays a warning banner with a "Reconnect" call-to-action
