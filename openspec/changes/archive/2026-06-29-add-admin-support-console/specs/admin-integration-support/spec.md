## ADDED Requirements

### Requirement: Accounting integration state is inspectable
The system MUST allow admins to inspect MYOB and Xero integration state, including provider name, connection status, token expiry state, scopes granted, last sync time, last sync result, failed sync attempts, API error history, webhook status, and sync cursor or state. Sensitive token values MUST NOT be exposed.

#### Scenario: Integration inspection shows sync state
- **WHEN** an admin opens an integration record
- **THEN** the sync state and failure history are visible

#### Scenario: Token values remain masked
- **WHEN** the integration record contains OAuth tokens
- **THEN** the tokens are not rendered in plaintext

### Requirement: Integration corrective actions are controlled
Admins SHOULD be able to retry failed syncs, force incremental syncs, force full syncs, disconnect integrations, reprocess webhooks, reset sync cursors with confirmation, map unmatched customers, exclude duplicate imported invoices, and archive bad imported records.

#### Scenario: Reset cursor requires confirmation
- **WHEN** an admin resets a sync cursor
- **THEN** the action requires confirmation and is audited

#### Scenario: Duplicate import correction is controlled
- **WHEN** an admin excludes a duplicate imported invoice
- **THEN** the change is recorded as an audit event with target context
