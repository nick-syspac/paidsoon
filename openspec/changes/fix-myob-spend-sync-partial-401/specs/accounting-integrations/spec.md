## MODIFIED Requirements

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
