# accounting-integrations Specification

## Purpose
TBD - created by archiving change add-accounting-integrations. Update Purpose after archive.

## Requirements

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
The system SHALL allow an authenticated user with the required subscription entitlement to connect a MYOB Business company file via OAuth 2.0. The integration SHALL request the complete MYOB granular read scopes required for both receivables sync and SpendLeak spend-side ingestion. After authorisation, the system SHALL persist the granted scopes with the connection and SHALL treat missing required spend scopes as an incomplete grant that requires reconnect before MYOB spend-side ingestion can be considered ready.

#### Scenario: MYOB connect button clicked
- **WHEN** an entitled user clicks "Connect MYOB" in integrations settings
- **THEN** the system generates a state nonce, stores it in `oauth_states`, and redirects the user to the MYOB authorisation URL with the required receivables and spend-read scopes

#### Scenario: MYOB OAuth callback received
- **WHEN** MYOB redirects back with a valid `code` and matching `state`
- **THEN** the system exchanges tokens, fetches provider company-file identity, and persists encrypted tokens and granted scopes with the connection
- **AND** if granted scopes include the full required spend-read set, the connection is marked eligible for both receivables and spend-side sync
- **AND** if granted scopes omit one or more required spend-read scopes, the connection remains receivables-capable but is marked spend-scope-upgrade-required with reconnect guidance

#### Scenario: User selects MYOB company file
- **WHEN** the user confirms the target MYOB company-file context returned by callback metadata
- **THEN** the system creates or updates the `accounting_connections` row scoped to that company file with encrypted tokens, granted scopes, and first-sync trigger behavior

#### Scenario: Existing MYOB connection predates scope expansion
- **WHEN** a previously connected MYOB tenant has tokens that were granted before spend-read scopes became required
- **THEN** receivables sync remains operational
- **AND** spend-side sync reports scope-upgrade-required until the tenant reconnects and grants the full scope set

#### Scenario: MYOB endpoint contract differs from assumed spend endpoint paths
- **WHEN** a connection has valid spend scopes and a freshly refreshed token
- **THEN** the system SHALL use MYOB Business-compatible endpoint families for spend ingestion
- **AND** it SHALL NOT rely on unsupported purchase bill subtype paths or deprecated/non-canonical banking transaction paths that deterministically fail for supported tenants

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

### Requirement: Settings use a unified Connections destination
The system SHALL use `/dashboard/settings/connections` as the canonical settings destination
for all provider setup, including Stripe Connect and accounting integrations.

#### Scenario: User opens settings navigation
- **WHEN** an authenticated user opens dashboard settings
- **THEN** navigation shows a single "Connections" tab instead of separate "Stripe Connection" and "Integrations" tabs

#### Scenario: User visits legacy Stripe settings URL
- **WHEN** a user navigates to `/dashboard/settings/stripe`
- **THEN** the system redirects to `/dashboard/settings/connections` and preserves existing query parameters

#### Scenario: User visits legacy integrations settings URL
- **WHEN** a user navigates to `/dashboard/settings/integrations`
- **THEN** the system redirects to `/dashboard/settings/connections` and preserves existing query parameters

#### Scenario: OAuth callback returns with status query parameters
- **WHEN** Stripe, Xero, or MYOB callback routes redirect after connect/cancel/error
- **THEN** the user lands on `/dashboard/settings/connections` and sees provider-appropriate feedback without cross-provider message collision

### Requirement: Accounting integration layer SHALL provide tax-relevant normalized inputs
The accounting integration layer SHALL expose tax-relevant fields and metadata that are available from provider data while preserving provider-agnostic interfaces.

#### Scenario: Provider supports tax or GST metadata
- **WHEN** provider records include tax treatment, tax code, or GST amount metadata
- **THEN** normalized outputs include the available tax metadata fields for downstream estimation
- **THEN** provider-specific parsing remains isolated inside provider adapters

### Requirement: Accounting integration layer SHALL degrade safely when tax metadata is unavailable
The system SHALL preserve calculation continuity when provider-level tax metadata is missing by marking confidence and using configured fallback methods.

#### Scenario: Missing provider tax-code details
- **WHEN** a provider source omits tax code fields for a subset of records
- **THEN** Tax Buffer receives fallback-safe normalized records with source caveats
- **THEN** downstream outputs mark confidence as reduced instead of presenting definitive liabilities
