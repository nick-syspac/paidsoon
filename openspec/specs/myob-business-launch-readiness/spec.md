# myob-business-launch-readiness Specification

## Purpose
TBD - created by archiving change harden-myob-business-go-live. Update Purpose after archive.
## Requirements
### Requirement: MYOB connection readiness distinguishes authorisation from usable data collection
The system SHALL distinguish a MYOB Business connection that has completed OAuth authorisation from one that has completed initial invoice-collection readiness. A connection SHALL NOT be represented as fully ready unless the system has either completed the first sync or surfaced an explicit pending/error state for that sync.

#### Scenario: OAuth callback completes before first sync finishes
- **WHEN** MYOB redirects back with a valid `code`, a valid `state`, and a selected company file
- **THEN** the system stores the connection and presents a connection state that clearly indicates first-sync pending or in progress rather than implying invoice import is already complete

#### Scenario: First sync fails after callback
- **WHEN** the first MYOB sync fails after the connection is persisted
- **THEN** the system marks the connection with an actionable failure state and exposes the failure outcome to both the user-facing integrations view and operator-facing support surfaces

### Requirement: MYOB connection records preserve stable company-file identity and readable naming
The system SHALL persist the MYOB company-file URI returned by the provider as the stable organisation identifier for the connection. The system SHALL also store a readable organisation name derived from provider metadata when available, and SHALL fall back to a deterministic identifier-based label when provider name resolution fails.

#### Scenario: Provider returns company-file metadata successfully
- **WHEN** the callback flow or follow-up metadata fetch returns a human-readable company-file name for the selected MYOB file
- **THEN** the system stores that name on the connection and uses it in user and admin connection listings

#### Scenario: Provider name resolution fails
- **WHEN** the system cannot resolve a human-readable name for the selected MYOB company file
- **THEN** the system still stores the stable company-file URI and derives a deterministic fallback display name that support staff can match to the connection record

### Requirement: MYOB connection health is visible in user and admin surfaces
The system SHALL expose MYOB connection health in both user-facing and admin-facing surfaces, including connection status, most recent sync outcome, and the last successful sync timestamp when available.

#### Scenario: User views a connection awaiting first sync
- **WHEN** a user opens the integrations settings page for a MYOB connection that has not yet completed its first sync
- **THEN** the page displays a status that distinguishes pending validation from an active, ready connection

#### Scenario: Admin investigates a failing MYOB connection
- **WHEN** an admin reviews a MYOB connection in support tooling after a failed sync
- **THEN** the admin can see the provider, company-file name, connection status, last sync timestamp, and can trigger a resync without access to plaintext tokens

### Requirement: MYOB disconnect and revoked states prevent silent continuation
The system SHALL prevent a disconnected, revoked, or errored MYOB connection from appearing healthy or silently continuing as though invoice collection were current.

#### Scenario: MYOB connection is revoked after initial success
- **WHEN** a subsequent provider interaction indicates the MYOB connection is no longer authorised
- **THEN** the system marks the connection as revoked, stops treating it as current, and prompts the user to reconnect

#### Scenario: User disconnects a MYOB connection
- **WHEN** a user disconnects a MYOB Business connection
- **THEN** the system marks the connection as disconnected and ensures follow-up workflows no longer treat the connection as an active invoice source

