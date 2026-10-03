# Spec Delta

## MODIFIED Requirements

### Requirement: User can connect a Xero organisation

The system SHALL allow an authenticated user with the existing required subscription entitlement to
initiate an OAuth 2.0 authorisation flow to connect their Xero account. The flow SHALL use
PKCE and a short-lived state nonce to prevent CSRF. After successful authorisation, the user
SHALL be prompted to select one organisation (tenant) from their Xero account if multiple
are available. When a Xero organisation is finalised as a connection, the system SHALL
immediately trigger the first sync for that connection.

#### Scenario: Xero connect button clicked

- **WHEN** an entitled user clicks "Connect Xero" in the integrations settings
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

- **WHEN** a user without the required accounting integration entitlement attempts to connect Xero
- **THEN** the system displays an upgrade prompt and does NOT initiate the OAuth flow

### Requirement: User can connect a MYOB Business company file

The system SHALL allow an authenticated, entitled user to connect one MYOB Business company file per OAuth grant using callback metadata, without a company-file discovery request or selection UI. It SHALL persist encrypted credentials and granted granular receivables/spend-read scopes, retain reconnect guidance for incomplete spend grants, and immediately trigger the first sync on finalization.

#### Scenario: MYOB connect button clicked

- **WHEN** an entitled user clicks "Connect MYOB" in integrations settings
- **THEN** the system generates a state nonce, stores it in `oauth_states`, and redirects the user to the MYOB authorisation URL with required granular receivables and spend-read scopes, not the deprecated `CompanyFile` scope

#### Scenario: MYOB OAuth callback received

- **WHEN** MYOB redirects back to `/api/integrations/myob/callback` with a valid `code`, unexpired matching `state`, an authenticated user matching that state, and `businessId`
- **THEN** the system exchanges the code for tokens, constructs the company-file URI from the callback `businessId`, and creates or updates the connection with encrypted tokens and granted scopes
- **AND** it immediately triggers the first sync without discovering company files or redirecting to a selection page
- **AND** a full spend-scope grant permits existing spend-side ingestion, while an incomplete spend-scope grant retains receivables capability and displays `scope_upgrade_required` reconnect guidance

#### Scenario: User selects MYOB company file

- **WHEN** the user authorizes the target company file in MYOB's OAuth flow and MYOB returns that context as callback `businessId`
- **THEN** PaidSoon creates or updates the connection for that company file with encrypted tokens and granted scopes and immediately triggers the first sync
- **AND** no PaidSoon company-file discovery request or selection screen is required

#### Scenario: MYOB callback omits the company-file identifier

- **WHEN** the MYOB callback lacks `businessId`
- **THEN** the system returns the existing `missing_params` redirect without saving a connection or triggering a sync

#### Scenario: MYOB callback company name is missing or blank

- **WHEN** a valid MYOB callback includes `businessId` but no usable `businessName`
- **THEN** the system preserves the existing deterministic company-file name fallback and completes the direct connection and first-sync trigger

#### Scenario: Existing MYOB connection predates scope expansion

- **WHEN** a previously connected MYOB tenant has tokens that were granted before spend-read scopes became required
- **THEN** receivables sync remains operational
- **AND** spend-side sync reports scope-upgrade-required until the tenant reconnects and grants the full scope set

#### Scenario: MYOB endpoint contract differs from assumed spend endpoint paths

- **WHEN** a connection has valid spend scopes and a freshly refreshed token
- **THEN** the system SHALL use MYOB Business-compatible endpoint families for spend ingestion
- **AND** it SHALL NOT rely on unsupported purchase bill subtype paths or deprecated/non-canonical banking transaction paths that deterministically fail for supported tenants

### Requirement: System surfaces connection status and sync health to user

The system SHALL display the current status of each accounting connection, including whether
it is awaiting its first sync, active, revoked, or in error, together with the date/time of
the last successful sync in the integrations settings UI.

#### Scenario: User views integrations settings with active connection

- **WHEN** a user navigates to the integrations settings page with an active connection
- **THEN** the system shows the provider name, organisation/company name, connection status, last synced timestamp, and the number of invoices synced in the last run

#### Scenario: Connection is awaiting its first sync

- **WHEN** a user views integrations settings and one connection is in `pending_first_sync` after finalization or accepted worker dispatch
- **THEN** the system displays it as awaiting its first sync rather than active or fully synced, with no fabricated last-successful-sync timestamp
- **AND** the UI does not claim that queued work is already running solely because the connection is pending

#### Scenario: Initial sync could not be dispatched to the worker

- **WHEN** a configured-worker dispatch fails and the connection has not successfully synced
- **THEN** settings and sync-health surfaces expose the recorded dispatch failure with safe retry guidance rather than claiming a successful import
- **AND** the OAuth or Xero selection flow still returns the user to the connections settings destination with its existing connection-success feedback

#### Scenario: Connection is in revoked state

- **WHEN** a user views integrations settings and one connection has `status = 'revoked'`
- **THEN** the system displays a warning banner with a "Reconnect" call-to-action
- **AND** it does not offer Sync now as a substitute for reauthorization
